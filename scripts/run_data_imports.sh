#!/usr/bin/env bash
# 每小時資料匯入：由 systemd timer（deploy/systemd/taoyuan-air-data-import.timer）呼叫，也可手動執行。
#
#   1. 風光達：直接讀 SFTP 資料夾，只匯入資料庫還沒有的日期
#   2. 無人機：直接讀 SFTP 的觀音資料夾，gas＋met 合併後匯入（每趟飛行會整趟重寫）
#   3. TYDEP 即時：匯入 data/raw/tydep-stations/realtime/ 裡由 watcher 搬進來的 CSV
#
# 各步驟互不影響：某一步失敗會記錄下來，其他步驟照跑，最後以非 0 結束讓 systemd 標記失敗。
# 路徑可用環境變數覆寫（寫在 deploy/deploy.env 即可）。
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="$REPO_ROOT/deploy/deploy.env"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

# 匯入程式需要 psycopg2，後端 .venv 沒有裝，所以用系統的 python3
PYTHON="${IMPORT_PYTHON:-$(command -v python3)}"

WIND_LIDAR_SRC="${WIND_LIDAR_SRC:-/data/sftp_root/uploads/WindLidar}"
UAV_SRC="${UAV_SRC:-/data/sftp_root/uploads/UAV/Guanyin}"   # 大園（Dayuan）先不匯
TYDEP_REALTIME_DIR="${TYDEP_REALTIME_DIR:-$REPO_ROOT/data/raw/tydep-stations/realtime}"

LOG_DIR="${DEPLOY_LOG_DIR:-/var/log/taoyuan-air}"
mkdir -p "$LOG_DIR" 2>/dev/null || LOG_DIR="$REPO_ROOT/data/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/data-import.log"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

cd "$REPO_ROOT"
failed=()

run_step() {
  local name="$1"; shift
  log "── $name 開始"
  if "$@" >>"$LOG_FILE" 2>&1; then
    log "── $name 完成"
  else
    log "── $name 失敗（詳見 $LOG_FILE）"
    failed+=("$name")
  fi
}

if [ -d "$WIND_LIDAR_SRC" ]; then
  run_step "風光達" "$PYTHON" scripts/import_wind_lidar.py --raw-dir "$WIND_LIDAR_SRC" --skip-existing
else
  log "── 風光達：找不到 $WIND_LIDAR_SRC，略過"
fi

if [ -d "$UAV_SRC" ]; then
  run_step "無人機" "$PYTHON" scripts/import_uav.py --raw-dir "$UAV_SRC"
else
  log "── 無人機：找不到 $UAV_SRC，略過"
fi

run_step "TYDEP 即時" "$PYTHON" scripts/update_tydep_realtime.py --dir "$TYDEP_REALTIME_DIR"

if [ "${#failed[@]}" -gt 0 ]; then
  log "本次失敗：${failed[*]}"
  exit 1
fi
log "全部完成"
