#!/usr/bin/env python3
"""
將 MOEaqdata_068_Zhongli.csv（寬表格）轉換為與其他測站相同的 JSON 格式
每列一小時 → 拆成每筆一個污染物
只保留 6 種: SO2, CO, O3, PM2.5, PM10, NO2
按月份分割輸出，檔名格式: 空氣品質小時值_桃園市_中壢站 (YYYY-MM).json
"""

import json
import csv
from pathlib import Path
from collections import defaultdict

FOLDER  = Path(__file__).parent.parent / 'data' / 'raw' / 'moe-stations' / 'AQX_P_255_Resource'
CSV_FILE = FOLDER / 'MOEaqdata_068_Zhongli.csv'

SITE_ID   = '68'
SITE_NAME = '中壢'
COUNTY    = '桃園市'

# CSV 欄位 → (itemid, itemname, itemengname, itemunit)
COLUMN_MAP = {
    'SO2 (ppb)':    ('1',  '二氧化硫',   'SO2',   'ppb'),
    'CO (ppm)':     ('2',  '一氧化碳',   'CO',    'ppm'),
    'O3 (ppb)':     ('3',  '臭氧',       'O3',    'ppb'),
    'PM10 (ug/m3)': ('4',  '懸浮微粒',   'PM10',  'ug/m3'),
    'NO2 (ppb)':    ('7',  '二氧化氮',   'NO2',   'ppb'),
    'PM2.5 (ug/m3)':('33', '細懸浮微粒', 'PM2.5', 'ug/m3'),
}


def main():
    if not CSV_FILE.exists():
        print(f"[ERROR] 找不到檔案: {CSV_FILE}")
        return

    # 按月份收集資料
    monthly: dict[str, list] = defaultdict(list)

    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_str = row.get('Date', '').strip()
            if not date_str or len(date_str) < 16:
                continue

            # 取 YYYY-MM 作為月份 key
            month_key = date_str[:7]  # e.g. "2019-01"
            monitor_date = date_str[:16]  # e.g. "2019-01-01 00:00"

            for col, (item_id, item_name, eng_name, unit) in COLUMN_MAP.items():
                val = row.get(col, '').strip()
                # NaN 或空值轉為 'x'
                if val in ('', 'NaN', 'nan', 'NULL', 'null'):
                    concentration = 'x'
                else:
                    concentration = val

                monthly[month_key].append({
                    'siteid':        SITE_ID,
                    'sitename':      SITE_NAME,
                    'county':        COUNTY,
                    'itemid':        item_id,
                    'itemname':      item_name,
                    'itemengname':   eng_name,
                    'itemunit':      unit,
                    'monitordate':   monitor_date,
                    'concentration': concentration,
                })

    print(f"共 {len(monthly)} 個月份，開始輸出...\n")

    total_files = 0
    total_records = 0

    for month_key in sorted(monthly.keys()):
        records = monthly[month_key]
        filename = f"空氣品質小時值_{COUNTY}_{SITE_NAME}站 ({month_key}).json"
        out_path = FOLDER / filename

        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        print(f"  [OK] {filename} ({len(records)} 筆)")
        total_files += 1
        total_records += len(records)

    print(f"\n完成：{total_files} 個檔案，共 {total_records:,} 筆資料")


if __name__ == '__main__':
    main()
