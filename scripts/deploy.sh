#!/usr/bin/env bash
# 自動部署主流程：由 systemd timer 定期呼叫，也可以手動執行測試。
# 沒有更新就直接結束；有更新才 build/restart；任何一步失敗就 rollback 到上一個成功的 commit。
#
# Git 策略：VM 上的 repo 全程停留在 attached branch（例如 main），不用 detached HEAD。
# 往前走用 `git merge --ff-only`，rollback 用 `git reset --hard` 回到上一個成功的 commit
# ——這是這個腳本自己的、可控的 rollback 機制，跟「不要在 Production 手動 git reset --hard」
# 的規則不衝突（那條規則講的是人為隨手操作，不是這裡設計好的自動化流程）。
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/deploy.env"

[ -f "$ENV_FILE" ] || { echo "找不到 $ENV_FILE，請先 cp deploy/deploy.env.example deploy/deploy.env 並填值" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${PROJECT_DIR:?}"; : "${DEPLOY_BRANCH:?}"; : "${PROCESS_MANAGER:?}"
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-/var/log/taoyuan-air}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-/var/lib/taoyuan-air}"
LOCK_FILE="/tmp/taoyuan-air-deploy.lock"
STATE_FILE="$DEPLOY_STATE_DIR/last-successful-deploy.json"
FAILED_MARKER="$DEPLOY_STATE_DIR/last-failed-commit"
DEPLOY_LOG="$DEPLOY_LOG_DIR/deploy.log"
TIMER_UNIT="taoyuan-air-deploy.timer"

# 第一次手動部署（VM_DEPLOYMENT_STEPS.md Phase 5）在裝 timer（Phase 7）之前就會跑到這裡，
# 所以這兩個目錄要在這裡就緒，不能只靠 Phase 7 的 install -d。目錄的 owner 仍然要由
# Phase 5 前手動用 sudo install -d 建立好，這裡的 mkdir -p 只是防呆。
mkdir -p "$DEPLOY_LOG_DIR" "$DEPLOY_STATE_DIR"

log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a "$DEPLOY_LOG"; }

exec 9>"$LOCK_FILE"
flock -n 9 || { echo "已有部署在執行中，結束"; exit 0; }

cd "$PROJECT_DIR"

log "開始部署檢查"
git fetch origin "$DEPLOY_BRANCH"

current_commit="$(git rev-parse HEAD)"
target_commit="$(git rev-parse "origin/$DEPLOY_BRANCH")"

if [ "$current_commit" = "$target_commit" ]; then
  log "NO UPDATE（HEAD 已經是 origin/$DEPLOY_BRANCH：$current_commit）"
  exit 0
fi

if [ -f "$FAILED_MARKER" ] && [ "$(cat "$FAILED_MARKER")" = "$target_commit" ]; then
  log "origin/$DEPLOY_BRANCH（$target_commit）先前已經部署失敗過，且還沒有新 commit，跳過自動重試。"
  log "修好問題並 push 新 commit 後會自動再試；要強制重跑同一個 commit，手動刪除 $FAILED_MARKER。"
  exit 0
fi

log "跑部署前檢查"
"$SCRIPT_DIR/pre-deploy-check.sh"

log "偵測到更新：$current_commit -> $target_commit"
previous_commit="$current_commit"

restart_services() {
  if [ "$PROCESS_MANAGER" = "systemd" ]; then
    sudo systemctl restart "$SYSTEMD_BACKEND_SERVICE"
    sudo systemctl restart "$SYSTEMD_FRONTEND_SERVICE"
  else
    pm2 restart "$PM2_BACKEND_NAME"
    pm2 restart "$PM2_FRONTEND_NAME"
    pm2 save
  fi
}

write_state() {
  local status="$1" commit="$2" duration="$3"
  cat > "$STATE_FILE" <<JSON
{
  "status": "$status",
  "branch": "$DEPLOY_BRANCH",
  "commit": "$commit",
  "previous_commit": "$previous_commit",
  "timestamp_utc": "$(date -u +%FT%TZ)",
  "duration_seconds": $duration
}
JSON
}

rollback() {
  # 先解除 ERR trap，避免 rollback 過程中任何一步失敗又遞迴呼叫自己
  trap - ERR
  log "部署失敗，rollback 到 $previous_commit"
  echo "$target_commit" > "$FAILED_MARKER"

  # rollback 本身也可能失敗（例如 npm ci 連不到 registry）。
  # 用 { ... } || rebuild_ok=0 包起來，確保不管中間哪一步失敗，
  # 下面寫 state 檔、停用 timer 這兩個「善後」動作一定會執行。
  rebuild_ok=1
  {
    git reset --hard "$previous_commit" &&
    npm ci --prefix frontend-web &&
    npm run build --prefix frontend-web &&
    (cd backend && . .venv/bin/activate && pip install -r requirements.txt) &&
    restart_services
  } || rebuild_ok=0

  if [ "$rebuild_ok" = "1" ] && "$SCRIPT_DIR/health-check.sh" local; then
    log "rollback 成功，服務已回到 $previous_commit"
    write_state "rolled_back" "$previous_commit" 0
  else
    log "rollback 未完全成功（rebuild_ok=$rebuild_ok），需要人工介入"
    write_state "rollback_failed" "$previous_commit" 0
  fi

  # origin/main 還是停在壞掉的 commit，不停用 timer 的話下一個週期會立刻重試同一個
  # 壞 commit、再 rollback，每 5 分鐘循環一次。停用 timer，等人修好、push 新 commit
  # 後，手動 `sudo systemctl enable --now taoyuan-air-deploy.timer` 重新開啟。
  log "停用自動部署 timer，避免重複重試同一個失敗的 commit"
  sudo systemctl disable "$TIMER_UNIT" || log "停用 $TIMER_UNIT 失敗，請手動處理"

  exit 1
}
trap rollback ERR

start_ts=$(date +%s)

log "merge 到 $target_commit（fast-forward only）"
git merge --ff-only "origin/$DEPLOY_BRANCH"

log "安裝 frontend 依賴"
npm ci --prefix frontend-web

log "build frontend"
npm run build --prefix frontend-web

log "安裝 backend 依賴"
cd backend
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
. .venv/bin/activate
pip install -r requirements.txt
cd "$PROJECT_DIR"

log "重啟服務（$PROCESS_MANAGER）"
restart_services

log "本機 health check"
"$SCRIPT_DIR/health-check.sh" local

log "對外 /tyair 驗證"
"$SCRIPT_DIR/health-check.sh" public

trap - ERR
rm -f "$FAILED_MARKER"
duration=$(( $(date +%s) - start_ts ))
write_state "success" "$target_commit" "$duration"
log "部署成功：$target_commit（耗時 ${duration}s）"
