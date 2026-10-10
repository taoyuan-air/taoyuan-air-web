#!/usr/bin/env bash
# 部署前檢查：任何一項失敗就 exit non-zero，deploy.sh 會因此中止，
# 不會去動正在跑的服務。所有檢查都是唯讀，不修改任何東西。
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/deploy.env"

fail() { echo "[pre-deploy-check] FAIL: $*" >&2; exit 1; }
ok()   { echo "[pre-deploy-check] OK: $*"; }

[ -f "$ENV_FILE" ] || fail "找不到 $ENV_FILE，請先 cp deploy/deploy.env.example deploy/deploy.env 並填值"
# shellcheck disable=SC1090
source "$ENV_FILE"

: "${PROJECT_DIR:?deploy.env 缺少 PROJECT_DIR}"
: "${DEPLOY_BRANCH:?deploy.env 缺少 DEPLOY_BRANCH}"
: "${BACKEND_PORT:?deploy.env 缺少 BACKEND_PORT}"
: "${FRONTEND_PORT:?deploy.env 缺少 FRONTEND_PORT}"
: "${PROCESS_MANAGER:?deploy.env 缺少 PROCESS_MANAGER}"

cd "$PROJECT_DIR" || fail "PROJECT_DIR 不存在或無法進入：$PROJECT_DIR"
ok "PROJECT_DIR 存在：$PROJECT_DIR"

[ -d .git ] || fail "$PROJECT_DIR 不是 git repository"
current_branch="$(git branch --show-current)"
[ "$current_branch" = "$DEPLOY_BRANCH" ] || fail "目前 branch 是 $current_branch，預期是 $DEPLOY_BRANCH"
ok "目前 branch 是 $DEPLOY_BRANCH"

remote_url="$(git remote get-url origin 2>/dev/null || true)"
case "$remote_url" in
  *taoyuan-air*) ok "git remote 指向 $remote_url" ;;
  *) fail "git remote 看起來不對：$remote_url" ;;
esac

git fetch origin "$DEPLOY_BRANCH" >/dev/null 2>&1 || fail "git fetch origin $DEPLOY_BRANCH 失敗，檢查 GitHub SSH/Deploy Key"
ok "git fetch 成功（GitHub SSH 可用）"

# 有 tracked local modification 就不要自動部署，避免蓋掉 VM-only 的手動修改
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "偵測到 tracked 檔案有未提交的修改，請先確認並處理，不自動覆蓋：$(git status --porcelain --untracked-files=no | tr '\n' ' ')"
fi
ok "沒有未預期的 tracked local modification"

for f in "backend/.env" "frontend-web/.env.production"; do
  [ -f "$f" ] || fail "缺少必要 env 檔案：$f"
done
ok "backend/.env 與 frontend-web/.env.production 都存在"

check_env_key() {
  local file="$1" key="$2"
  grep -q "^${key}=" "$file" || fail "$file 缺少必要變數：$key"
}
for key in DATABASE_URL SECRET_KEY FRONTEND_URL COOKIE_SECURE COOKIE_SAMESITE COOKIE_PATH; do
  check_env_key backend/.env "$key"
done
for key in NEXT_PUBLIC_BASE_PATH NEXT_PUBLIC_API_BASE CWA_API_KEY MOE_API_KEY; do
  check_env_key frontend-web/.env.production "$key"
done
ok "必要 env 變數名稱都存在（不檢查值內容）"

command -v node >/dev/null || fail "找不到 node"
command -v npm  >/dev/null || fail "找不到 npm"
command -v python3 >/dev/null || fail "找不到 python3"
ok "node $(node -v), npm $(npm -v), python3 $(python3 --version 2>&1 | awk '{print $2}')"

avail_kb="$(df --output=avail -k "$PROJECT_DIR" | tail -n1 | tr -d ' ')"
[ "$avail_kb" -gt 1048576 ] || fail "磁碟剩餘空間不足 1GB（目前 ${avail_kb}KB）"
ok "磁碟空間足夠（剩餘 ${avail_kb}KB）"

# 輕量 TCP 連線測試，只確認 DATABASE_URL 的 host:port 連得到，不代表帳密/schema正確
db_url="$(grep -m1 '^DATABASE_URL=' backend/.env | cut -d= -f2-)"
if [ -n "$db_url" ]; then
  python3 - "$db_url" <<'PY' || fail "連不到 DATABASE_URL 指向的 PostgreSQL host:port"
import socket
import sys
from urllib.parse import urlparse

url = sys.argv[1].replace("+asyncpg", "").replace("+psycopg2", "")
parsed = urlparse(url)
host, port = parsed.hostname, parsed.port or 5432
with socket.create_connection((host, port), timeout=5):
    pass
PY
  ok "PostgreSQL host:port 可連線"
else
  fail "backend/.env 的 DATABASE_URL 是空的"
fi
# 目前 backend 沒有實際使用 Redis（app 程式碼沒有任何 redis import），
# 所以這裡不檢查 Redis；如果之後 backend 開始依賴 Redis，要在這裡補上對應檢查。

case "$PROCESS_MANAGER" in
  systemd)
    : "${SYSTEMD_BACKEND_SERVICE:?deploy.env 缺少 SYSTEMD_BACKEND_SERVICE}"
    : "${SYSTEMD_FRONTEND_SERVICE:?deploy.env 缺少 SYSTEMD_FRONTEND_SERVICE}"
    systemctl list-unit-files "$SYSTEMD_BACKEND_SERVICE" --no-legend | grep -q . \
      || fail "找不到 systemd unit：$SYSTEMD_BACKEND_SERVICE"
    systemctl list-unit-files "$SYSTEMD_FRONTEND_SERVICE" --no-legend | grep -q . \
      || fail "找不到 systemd unit：$SYSTEMD_FRONTEND_SERVICE"
    ok "systemd unit 存在：$SYSTEMD_BACKEND_SERVICE, $SYSTEMD_FRONTEND_SERVICE"
    ;;
  pm2)
    : "${PM2_BACKEND_NAME:?deploy.env 缺少 PM2_BACKEND_NAME}"
    : "${PM2_FRONTEND_NAME:?deploy.env 缺少 PM2_FRONTEND_NAME}"
    command -v pm2 >/dev/null || fail "找不到 pm2 指令"
    pm2 describe "$PM2_BACKEND_NAME"  >/dev/null 2>&1 || fail "pm2 沒有名為 $PM2_BACKEND_NAME 的 process"
    pm2 describe "$PM2_FRONTEND_NAME" >/dev/null 2>&1 || fail "pm2 沒有名為 $PM2_FRONTEND_NAME 的 process"
    ok "pm2 process 存在：$PM2_BACKEND_NAME, $PM2_FRONTEND_NAME"
    ;;
  *)
    fail "PROCESS_MANAGER 必須是 systemd 或 pm2，目前是：$PROCESS_MANAGER"
    ;;
esac

echo "[pre-deploy-check] 全部檢查通過"
