# 桃園空氣品質 ML

這個模組負責整理空氣品質與氣象資料、訓練模型，並產生桃園的歷史 PM2.5 分布地圖。它使用獨立的 Python 環境，網站後端則負責呼叫已訓練好的模型、提供結果給前端。

## 整體架構

```text
資料庫中的測站與氣象觀測
          ↓
整理成訓練資料
          ↓
訓練模型 → 評估與報告
          ↓
產生歷史 PM2.5 網格
          ↓
後端 API → 網站 /history
```

一般網格推估可結合 XGBoost 與空間插值；目前 `/history` 地圖使用 XGBoost，將桃園切成約 3 km × 3 km 的網格，呈現各格的小時濃度推估。查詢地圖時會使用既有模型，不會重新訓練。

主要目錄如下，`data/` 和 `scripts/` 都位於專案根目錄：

| 位置 | 用途 |
|---|---|
| `ml/src/taoyuan_ml/data/`、`features/` | 讀取資料，整理模型需要的輸入 |
| `ml/src/taoyuan_ml/models/`、`spatial/` | 訓練模型、推估空間分布 |
| `ml/src/taoyuan_ml/evaluation/`、`reporting/` | 評估表現、產生報告與地圖 |
| `ml/configs/` | 模型參數與實驗設定 |
| `ml/tests/` | 自動化測試 |
| `scripts/` | 資料下載與鄰近測站比較實驗 |
| `data/processed/ml/` | 整理後的資料集 |
| `data/models/` | 訓練完成的模型與設定 |
| `data/exports/ml/` | 評估結果、報告與地圖輸出 |

## 安裝

需要 Python 3.11 以上。以下指令以 Windows PowerShell 為例，均在**專案根目錄**執行。請保留這份專案的目錄結構。

```powershell
python -m venv ml/.venv
.\ml\.venv\Scripts\Activate.ps1
python -m pip install -e ./ml
```

如果不方便啟用虛擬環境，也可以直接使用 `.\ml\.venv\Scripts\python.exe` 執行 Python 指令。

若要使用 `scripts/` 裡的下載與實驗工具，再安裝其依賴：

```powershell
python -m pip install -r scripts/requirements.txt
```

## 環境與模型設定

首次使用時，將 `ml/.env.example` 複製為 `ml/.env`，填入資料庫連線資訊：

```dotenv
DATABASE_URL=postgresql://DB_USER:DB_PASSWORD@127.0.0.1:5432/taoyuan_air

# 選填：資料與模型的存放位置，預設為專案根目錄的 data/
# ML_DATA_ROOT=C:/path/to/data
```

請換成自己的帳號、密碼與資料庫名稱。也支援後端使用的 `postgresql+asyncpg://` 連線格式。

一般匯出流程讀取資料庫中已匯入的觀測，不會自行下載資料。資料匯入工具放在 `scripts/`。若想沿用後端的資料庫設定，可在指令中明確指定 `--env-file backend/.env`；程式不會自動改讀後端的 `.env`。

模型預設設定在 [`configs/default.toml`](configs/default.toml)。需要調整訓練參數時，可參考 [`configs/experiments/`](configs/experiments/)，在訓練指令加上 `--config` 指定設定檔。既有模型在推估時會沿用訓練時保存的設定。

## 基本使用流程

以 PM2.5 為例，啟用虛擬環境後依序執行：

```powershell
# 1. 從資料庫匯出資料集
python -m taoyuan_ml --dataset-id meteo-demo-v1 export --variable pm25

# 2. 使用資料集訓練模型
python -m taoyuan_ml --dataset-id meteo-demo-v1 --run-id pm25-demo-v1 train --variable pm25

# 3. 評估模型
python -m taoyuan_ml --run-id pm25-demo-v1 validate --max-hours 100

# 4. 建立歷史地圖可選的日期與時刻
python -m taoyuan_ml --run-id pm25-demo-v1 history-map --catalog
```

`dataset-id` 是資料集名稱，`run-id` 是模型版本名稱。範例名稱可以自行更換；更新資料或重新訓練時，請使用新名稱，保留舊版成果。

共用設定（例如 `--run-id`、`--env-file`）放在動作名稱之前。更多指令可查詢：

```powershell
python -m taoyuan_ml --help
python -m taoyuan_ml predict --help
```

## 連接網站

在 `backend/.env` 設定要使用的模型版本，名稱需與上面的 `run-id` 一致：

```dotenv
ML_HISTORY_RUN_ID=pm25-demo-v1

# 選填：使用其他環境或資料位置時才需要設定，建議填絕對路徑
# ML_PYTHON=C:/path/to/project/ml/.venv/Scripts/python.exe
# ML_DATA_ROOT=C:/path/to/project/data
```

先完成該版本的訓練與 `history-map --catalog`，再重新啟動後端、開啟前端的 `/history`。首次查詢某個時刻可能需要等待，之後會重用已產生的結果。

右上角的「訓練成果」可查看模型資訊與版本比較；比較內容需要另外產生實驗報告，一般訓練不會自動建立。鄰近測站名單在 `ml/configs/regional_stations.json`，相關流程可查看 `scripts/train_regional_pm25.py` 與 `scripts/report_regional_pm25.py` 的 `--help`。

部署到其他機器時，除了程式碼，也需要另行搬移選定版本的資料集、模型及相關報告。這些產物不會隨 Git 上傳。

## 使用時需要知道的事

- 地圖呈現歷史小時濃度的空間推估，不能當成未來預報或日 AQI。
- 可查詢的日期取決於空氣品質與氣象資料是否齊全；只補其中一種資料，未必能延長可查詢期間。
- 遠離測站的地區，例如山區，推估結果需更審慎解讀。空間診斷也不等於完全未見測站的泛化測試。

## 執行測試

需要開發或修改程式時，再安裝測試依賴並執行：

```powershell
python -m pip install -e "./ml[test]"
python -m pytest ml/tests -q
```

測試使用合成資料與暫存目錄，不需要連接真實資料庫。
