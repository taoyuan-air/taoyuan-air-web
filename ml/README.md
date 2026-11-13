# 桃園空氣品質 ML

這是獨立執行的離線 Python 套件。資料匯出、訓練、空間推估、驗證及報告不會自動由網站後端觸發。

## 安裝

需要 Python 3.11 以上。在專案根目錄執行（Windows PowerShell）：

```powershell
python -m venv ml/.venv
./ml/.venv/Scripts/Activate.ps1
python -m pip install -e "./ml[test]"
```

目前以 repository editable installation 為使用方式，保留 `ml/configs/` 與根目錄 `data/` 的相對位置。套件安裝後可從任何資料夾執行 `taoyuan-ml` 或 `python -m taoyuan_ml`。相對的 CLI 路徑以目前工作目錄解析，預設資料路徑則固定相對專案根目錄。

## 環境與實驗設定

將 `ml/.env.example` 複製成 `ml/.env`，填入 `DATABASE_URL`；或以 `--env-file backend/.env` 明確沿用後端設定。支援 `postgresql://` 與後端的 `postgresql+asyncpg://` 格式。程序環境變數優先於 `.env`；不會自動搜尋其他目錄的 `.env`。密碼及 API 金鑰不會寫入實驗快照。

ML 不需要首頁的 CWA/MOE API 金鑰，而是讀取 PostgreSQL 已匯入的資料。資料庫 schema 留在 `database/`，匯入工具留在 `scripts/`。

`configs/default.toml` 保留原本模型參數、網格範圍和時間切分。`configs/experiments/*.toml` 可以只覆寫部分設定，透過 `--config` 指定。`--variable` 選擇要執行的變數，設定檔名稱本身不會自動選擇變數。

`lag_hours` 必須遞增、不重複，包含 1 與至少另一個正整數時差。Rolling 特徵以實際的前三／六小時觀測計算，不會因缺時資料而取用更早的資料列；推估也會讀取完整六小時視窗。

## 執行流程

以下指令均在專案根目錄執行。**共用選項放在動作前面**，各動作選項放後面。

```powershell
# 1. 從現有資料庫匯出所有變數，建立資料集 manifest
taoyuan-ml --env-file backend/.env --dataset-id meteo-v1 export --all

# 2. 每次訓練使用新的 run-id，避免覆蓋既有模型
taoyuan-ml --dataset-id meteo-v1 --run-id pm25-v1 --config ml/configs/experiments/pm25.toml train --variable pm25

# 3. 既有 run 自動載入保存的設定及 dataset-id
taoyuan-ml --run-id pm25-v1 validate --max-hours 100 --calibrate
taoyuan-ml --run-id pm25-v1 compare --max-hours 100
taoyuan-ml --run-id pm25-v1 predict --variable pm25 --time "2025-07-15 14:00"
taoyuan-ml --run-id pm25-v1 shap --variable pm25 --sample-size 3000
taoyuan-ml --run-id pm25-v1 plot --time "2025-07-15 14:00"

# 多變數可在同一次訓練處理
taoyuan-ml --dataset-id meteo-v1 --run-id multivar-v1 train --all

# 查詢各動作的參數
taoyuan-ml --help
taoyuan-ml predict --help
```

`--data-root` 可改用其他資料儲存位置；使用既有 run 時也須指定相同位置。也可在 `ml/.env` 設定絕對路徑 `ML_DATA_ROOT`。

## 目錄與責任

```text
ml/
  configs/                  # 無密鑰的預設與實驗參數
  src/taoyuan_ml/
    cli.py                  # 指令入口、資料集與實驗選擇
    settings.py             # 明確載入 .env、TOML 及路徑
    data/                   # 資料庫連線、SQL、Parquet 匯出
    features/               # 特徵定義、時間、鄰站、組裝流程
    models/                 # 訓練及模型／資料集產物管理
    spatial/                # 網格、插值、推估、可信度
    evaluation/             # 空間驗證、方法比較、校準、指標
    reporting/              # SHAP 與地圖
  tests/                    # 特徵、設定、產物與整合測試

data/
  processed/ml/<dataset_id>/
    *_hourly.parquet
    manifest.json           # 欄位、期間、筆數、匯出時間、SHA-256
  models/<run_id>/
    xgb_*.json
    config.toml             # 訓練時的完整設定快照
    metadata.json           # dataset、訓練狀態、Git commit、套件版本
    feature_schema.json     # 每個模型的目標、特徵版本與順序
    calibration.json        # 執行 --calibrate 後建立
  exports/ml/<run_id>/
    predictions/            # 網格 Parquet
    metrics/                # 訓練及空間評估結果
    shap/                   # SHAP CSV 與文字報告
    figures/                # 圖片
```

資料與模型產物由 `.gitignore` 排除。不要把密鑰加入 `configs/`。同一 dataset 可增加尚未匯出的變數，但禁止覆蓋已有 Parquet；資料內容改變時使用新 dataset-id。Run 保存當次資料 manifest 並檢查檔案雜湊，避免推估時默默使用不同資料。訓練拒絕覆蓋既有 run；失敗的訓練保留現場，重新執行請使用新的 run-id。報告與同時間的預測可重新產生。

只有 `metadata.json` 中狀態為 `complete` 的 run 可用於推估與報告；執行中或失敗的 run 會被拒絕。訓練使用的每個變數都必須列入 dataset manifest。特徵計算版本不符的模型必須以新 run-id 重新訓練，不能只沿用相同欄位名稱。

## 支援範圍與限制

| 功能 | PM2.5 | 溫度、濕度、風速、氣壓 | 風向 |
|---|---|---|---|
| 匯出、訓練、SHAP | 支援 | 支援 | 支援 sin/cos 模型 |
| 網格推估 | 支援 | 支援 | 尚未實作圓周重建 |
| 留一站驗證、方法比較、地圖 | 支援 | 尚未泛化 | 尚未泛化 |

推估需要目標時刻及所需 lag 時刻的測站觀測，是歷史空間補值，並非未來預報。可信度是測站距離與密度的規則分級，不等於統計信賴區間。校準門檻寫入該 run 的 `calibration.json`，後續推估會自動載入。

目前校準僅針對 PM2.5，其他變數使用預設的距離／測站密度分級。驗證的 `--time-range` 僅限制評估目標時間，仍保留範圍之前的 lag／rolling 歷史資料。

保留原本空間驗證的限制：XGBoost 不會在每個留一站 fold 重新訓練，只有空間殘差修正排除該站，因此不能解讀為完全獨立的未見測站泛化評估。此次整理不改變模型方法及此項限制。

## 從舊架構遷移

舊的 `ml/config.py`、`ml/export_parquet.py`、`ml/impute/` 與 `ml/visualize.py` 已由套件與 CLI 取代，不再使用 `sys.path.insert()`。舊的 `data/exports/*.parquet` 或 `data/models/xgb_*.json` 不會自動搬移或覆蓋；若有舊產物，請保留並透過新流程建立可追蹤的新 dataset/run。

## 驗證

```powershell
python -m pytest ml/tests -q
```

測試使用合成資料和暫存目錄，不讀取真實資料庫或密鑰。包含模擬資料庫的匯出處理、跨程序的訓練／推估／校準／報告流程，以及設定快照、資料異動偵測與特徵一致性。
