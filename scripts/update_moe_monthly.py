#!/usr/bin/env python3
"""
MOE 月資料補正腳本。

用途：每月正式歷史 JSON 釋出後，挑每個 MOE 測站資料夾最新 JSON，
匯入 `moe_hourly_data`，並只覆蓋既有 `source = 'realtime'` 的資料。
"""

from pathlib import Path

from import_moe_stations import (
    STATION_MAPPING,
    connect_db,
    ensure_moe_hourly_schema,
    ensure_moe_station_names,
    import_json_file,
)


ROOT_DIR = Path(__file__).parent.parent
DATA_DIR = ROOT_DIR / 'data' / 'raw' / 'moe-stations'


def get_latest_json_files() -> list[tuple[Path, str]]:
    """回傳每個 MOE 測站資料夾最新的 JSON 檔與 station_id。"""
    latest_files = []

    for folder_name, station_id in STATION_MAPPING.items():
        folder_path = DATA_DIR / f'{folder_name}_Resource'
        if not folder_path.exists():
            print(f"[WARNING] 測站資料夾不存在: {folder_path}")
            continue

        json_files = sorted(
            f for f in folder_path.glob('*.json')
            if f.name.lower() != 'hash.txt'
        )
        if not json_files:
            print(f"[WARNING] 找不到 JSON 檔案: {folder_path}")
            continue

        latest_files.append((json_files[-1], station_id))

    return latest_files


def main():
    print("=" * 60)
    print("MOE 月資料補正工具（history 覆蓋 realtime）")
    print("=" * 60)

    latest_files = get_latest_json_files()
    if not latest_files:
        print("[ERROR] 找不到任何可更新的 MOE JSON 檔案")
        return

    conn = connect_db()
    if not conn:
        return

    ensure_moe_hourly_schema(conn)
    ensure_moe_station_names(conn)

    total_records = 0
    for json_file, station_id in latest_files:
        print(f"\n[INFO] 更新測站 {station_id}: {json_file.name}")
        inserted = import_json_file(conn, json_file, station_id)
        total_records += inserted

    conn.close()

    print("\n" + "=" * 60)
    print("MOE 月資料補正完成")
    print("=" * 60)
    print(f"處理檔案數: {len(latest_files)}")
    print(f"處理資料筆數: {total_records:,}")


if __name__ == '__main__':
    main()

