#!/usr/bin/env bash
# 用法：
#   scripts/health-check.sh local    只檢查 VM 本機 127.0.0.1 上的服務
#   scripts/health-check.sh public   只檢查 https://ncu.edu.tw/tyair 對外網址
#   scripts/health-check.sh all      兩者都檢查（預設）
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/deploy.env"

[ -f "$ENV_FILE" ] || { echo "找不到 $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

# NEXT_PUBLIC_BASE_PATH 是 frontend build-time env，活在 frontend-web/.env.production，
# 不是 deploy.env 的一部分；用 grep 讀值，不要 source 整份 .env.production
# （裡面的 API key 可能含有會被 shell 誤解的字元）。
FRONTEND_ENV="$REPO_ROOT/frontend-web/.env.production"
BASE_PATH=""
if [ -f "$FRONTEND_ENV" ]; then
  BASE_PATH="$(grep -m1 '^NEXT_PUBLIC_BASE_PATH=' "$FRONTEND_ENV" | cut -d= -f2-)"
fi

mode="${1:-all}"
fail=0

check() {
  local desc="$1" url="$2"
  if curl -fsS -o /dev/null -w '%{http_code}' "$url" | grep -qE '^(2|3)'; then
    echo "[health-check] OK   $desc ($url)"
  else
    echo "[health-check] FAIL $desc ($url)" >&2
    fail=1
  fi
}

if [ "$mode" = "local" ] || [ "$mode" = "all" ]; then
  check "backend /health"       "http://127.0.0.1:${BACKEND_PORT}/health"
  check "frontend /"            "http://127.0.0.1:${FRONTEND_PORT}/"
  check "frontend /dashboard"   "http://127.0.0.1:${FRONTEND_PORT}${BASE_PATH}/dashboard"
fi

if [ "$mode" = "public" ] || [ "$mode" = "all" ]; then
  : "${PUBLIC_BASE_URL:?deploy.env 缺少 PUBLIC_BASE_URL}"
  check "public 首頁"              "$PUBLIC_BASE_URL"
  check "public /dashboard"        "$PUBLIC_BASE_URL/dashboard"
  check "public /api/moe"          "$PUBLIC_BASE_URL/api/moe"
fi

if [ "$fail" -ne 0 ]; then
  echo "[health-check] 有檢查失敗" >&2
  exit 1
fi
echo "[health-check] 全部通過（mode=$mode）"
