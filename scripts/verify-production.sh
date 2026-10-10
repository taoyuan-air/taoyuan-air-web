#!/usr/bin/env bash
# 比 health-check.sh 更完整的對外驗證：確認 /tyair 底下的頁面、靜態資源、
# nested route 直接 refresh、以及幾個 API route 都正常。手動部署後、
# 啟用自動部署前都應該跑一次；也可以在 deploy.sh 的最後一步呼叫。
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/deploy/deploy.env"

[ -f "$ENV_FILE" ] || { echo "找不到 $ENV_FILE" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"
: "${PUBLIC_BASE_URL:?deploy.env 缺少 PUBLIC_BASE_URL}"

# NEXT_PUBLIC_BASE_PATH 活在 frontend-web/.env.production，不是 deploy.env
FRONTEND_ENV="$REPO_ROOT/frontend-web/.env.production"
BASE_PATH=""
if [ -f "$FRONTEND_ENV" ]; then
  BASE_PATH="$(grep -m1 '^NEXT_PUBLIC_BASE_PATH=' "$FRONTEND_ENV" | cut -d= -f2-)"
fi

fail=0
check_status() {
  local desc="$1" url="$2" expect="${3:-2}"
  local code
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "$url" || echo 000)"
  if [[ "$code" == ${expect}* ]]; then
    echo "[verify] OK   $desc -> $code ($url)"
  else
    echo "[verify] FAIL $desc -> $code ($url)" >&2
    fail=1
  fi
}
check_body_contains() {
  local desc="$1" url="$2" needle="$3"
  if curl -fsS "$url" | grep -q "$needle"; then
    echo "[verify] OK   $desc"
  else
    echo "[verify] FAIL $desc（找不到 \"$needle\"）" >&2
    fail=1
  fi
}

# 1. 首頁與主要路由（含 direct refresh，也就是直接打路由 URL 而不是 client-side 導航）
check_status "首頁"                "$PUBLIC_BASE_URL"
check_status "/dashboard"          "$PUBLIC_BASE_URL/dashboard"
check_status "/map"                "$PUBLIC_BASE_URL/map"
check_status "/explorer"           "$PUBLIC_BASE_URL/explorer"
check_status "/login"              "$PUBLIC_BASE_URL/login"

# 2. 首頁 HTML 必須看得到帶 basePath 的 _next 資源，代表 assetPrefix 生效
check_body_contains "_next 資源走正確 basePath" "$PUBLIC_BASE_URL" "${BASE_PATH}/_next/static"

# 3. Next 內建的 API route（不需要資料庫）
check_status "/api/moe" "$PUBLIC_BASE_URL/api/moe"

# 4. 經 Nginx/Next rewrite 打到 FastAPI 的路由，僅供參考、不計入 pass/fail：
#    資料庫尚未匯入資料前這裡可能回 500，屬於預期狀況，
#    只要不是 502/504（代表 Nginx 連不到 backend）就不用擔心。
uav_code="$(curl -fsS -o /dev/null -w '%{http_code}' "$PUBLIC_BASE_URL/api/uav/flights" || echo 000)"
echo "[verify] INFO /api/uav/flights -> $uav_code（僅供參考，不影響本次驗證結果；502/504 才需要處理）"

if [ "$fail" -ne 0 ]; then
  echo "[verify] 有檢查失敗，不要啟用自動部署" >&2
  exit 1
fi

echo "[verify] 自動檢查全部通過。仍需手動瀏覽器驗證：登入、登出、cookie 屬性、nested route 重新整理。"
