"""
下載 MAIAC MCD19A2.061，裁切出臺北、新北、桃園、新竹的範圍，然後刪除原始 HDF
（只有要重新從 NASA 下載的人才需要；一般直接拿現成的 npz 即可）

用法（從專案根目錄執行）：
    python scripts/download_maiac.py 2019 2026      # 下載 2019-01-01 – 2026-05-31
    python scripts/download_maiac.py 2024 2024      # 只下載 2024 年

需要：
    pip install earthaccess pyhdf numpy
    export EARTHDATA_TOKEN='...'

輸出：data/raw/aod/maiac_crop/<年>/<原檔名>.npz（每個約數十 KB）
每個 npz 內含：
    aod_055   int16  (過境次數, 列, 行)  原始值，乘 0.001 才是 AOD，-28672 = 無值
    aod_qa    uint16 (過境次數, 列, 行)  原始 QA 位元，0 = 無值
    orbits    str    (過境次數,)        例如 '20241530135T'（UTC 年+日序+時分，T=Terra、A=Aqua）
    tile      str    例如 'h29v06'
    row0, col0 int   裁切範圍在 1200×1200 圖塊中的起點（用來換算經緯度）
可中斷後重跑：已經有 npz 的檔案會跳過。
"""
import sys
import tempfile
from datetime import date
from pathlib import Path

import numpy as np

# 範圍：臺北、新北、桃園、新竹全區，四周再多留約 5 km（西、南、東、北）
# 要與 import_maiac_aod.py 的 LON_MIN ~ LAT_MAX 一致
BBOX = (120.80, 24.35, 122.05, 25.35)
END_DATE = "2026-05-31"   # 與 PM2.5 補值資料期間對齊
OUT = Path("data/raw/aod/maiac_crop")

# MODIS 正弦投影常數
R = 6371007.181
TILE = 1111950.5197665
X0, Y0 = -20015109.354, 10007554.677
PIX = TILE / 1200


def crop_windows(bbox, pad=2):
    """算出 bbox 在每個圖塊中的列、行範圍"""
    w, s, e, n = bbox
    lon, lat = np.meshgrid(np.linspace(w, e, 400), np.linspace(s, n, 400))
    x = R * np.radians(lon) * np.cos(np.radians(lat))
    y = R * np.radians(lat)
    h = np.floor((x - X0) / TILE).astype(int)
    v = np.floor((Y0 - y) / TILE).astype(int)
    col = np.floor((x - X0 - h * TILE) / PIX).astype(int)
    row = np.floor((Y0 - y - v * TILE) / PIX).astype(int)
    wins = {}
    for hv in set(zip(h.ravel(), v.ravel())):
        m = (h == hv[0]) & (v == hv[1])
        wins[f"h{hv[0]:02d}v{hv[1]:02d}"] = (
            int(max(row[m].min() - pad, 0)), int(min(row[m].max() + pad, 1199) + 1),
            int(max(col[m].min() - pad, 0)), int(min(col[m].max() + pad, 1199) + 1),
        )
    return wins


WINDOWS = crop_windows(BBOX)


def crop_file(hdf_path: Path, out_dir: Path) -> Path:
    from pyhdf.SD import SD, SDC

    tile = hdf_path.name.split(".")[2]
    r0, r1, c0, c1 = WINDOWS[tile]
    sd = SD(str(hdf_path), SDC.READ)
    orbits = np.array(sd.attributes()["Orbit_time_stamp"].split())
    aod = sd.select("Optical_Depth_055")[:, r0:r1, c0:c1]
    qa = sd.select("AOD_QA")[:, r0:r1, c0:c1]
    sd.end()
    if aod.shape[0] != len(orbits):
        raise ValueError(f"過境次數不一致：{hdf_path.name}")
    out = out_dir / (hdf_path.stem + ".npz")
    np.savez_compressed(out, aod_055=aod, aod_qa=qa, orbits=orbits,
                        tile=tile, row0=r0, col0=c0)
    return out


def retry(func, what, tries=6):
    """網路斷線時自動重試，等待時間 30 秒、60 秒、120 秒……"""
    import time
    for k in range(tries):
        try:
            return func()
        except Exception as e:
            if k == tries - 1:
                print(f"  {what} 失敗 {tries} 次，先跳過：{type(e).__name__}")
                return None
            wait = 30 * 2 ** k
            print(f"  {what} 連線失敗（{type(e).__name__}），{wait} 秒後重試")
            time.sleep(wait)


def main():
    import earthaccess

    start = int(sys.argv[1]) if len(sys.argv) > 1 else 2023
    end = int(sys.argv[2]) if len(sys.argv) > 2 else 2026
    print("裁切範圍：", BBOX, "圖塊：", WINDOWS)
    earthaccess.login(strategy="environment")
    skipped = 0

    for year in range(start, end + 1):
        last = min(date(year, 12, 31), date.fromisoformat(END_DATE), date.today())
        if last < date(year, 1, 1):
            continue
        results = retry(lambda: earthaccess.search_data(
            short_name="MCD19A2", version="061",
            temporal=(f"{year}-01-01", last.isoformat()),
            bounding_box=BBOX,
        ), f"{year} 查詢")
        if results is None:
            skipped += 1
            continue
        out_dir = OUT / str(year)
        out_dir.mkdir(parents=True, exist_ok=True)
        done = {p.stem for p in out_dir.glob("*.npz")}
        todo = [r for r in results
                if Path(r.data_links()[0]).stem not in done
                and Path(r.data_links()[0]).name.split(".")[2] in WINDOWS]
        print(f"{year}：共 {len(results)} 個，已完成 {len(done)} 個，這次要處理 {len(todo)} 個")

        # 一次下載 20 個（同時 2 條連線），裁切完立刻刪除；斷線會自動重試
        for i in range(0, len(todo), 20):
            batch = todo[i:i + 20]
            with tempfile.TemporaryDirectory() as tmp:
                paths = retry(lambda: earthaccess.download(batch, tmp, threads=2),
                              f"{year} 第 {i + 1}–{i + len(batch)} 個下載")
                if paths is None:
                    skipped += 1
                    continue
                for p in paths:
                    p = Path(p)
                    try:
                        crop_file(p, out_dir)
                    except Exception as e:  # 單一檔案壞掉不影響其他檔案，下次重跑會再試
                        print("  失敗：", p.name, type(e).__name__, e)
            print(f"  {year}：{min(i + 20, len(todo))}/{len(todo)}")

    if skipped:
        print(f"有 {skipped} 批因為網路問題沒完成，再執行一次同樣的指令就會補上")
    else:
        print("全部完成")


if __name__ == "__main__":
    main()
