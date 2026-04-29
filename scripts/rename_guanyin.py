#!/usr/bin/env python3
"""
將觀音站所有 JSON 檔案：
1. sitename 從「觀音」改為「觀音_N」
2. 檔名從「觀音站」改為「觀音_N站」
"""

import json
from pathlib import Path

FOLDER = Path(__file__).parent.parent / 'data' / 'raw' / 'moe-stations' / 'AQX_P_207_Resource'


def main():
    json_files = sorted([f for f in FOLDER.glob('*觀音站*.json')])

    if not json_files:
        print("[ERROR] 找不到觀音站 JSON 檔案")
        return

    print(f"找到 {len(json_files)} 個檔案，開始處理...\n")

    for jf in json_files:
        # 1. 修改 JSON 內容
        with open(jf, 'r', encoding='utf-8') as f:
            records = json.load(f)

        for r in records:
            if r.get('sitename') == '觀音':
                r['sitename'] = '觀音_N'

        # 2. 新檔名
        new_name = jf.name.replace('觀音站', '觀音_N站')
        new_path = FOLDER / new_name

        with open(new_path, 'w', encoding='utf-8') as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

        # 3. 刪舊檔（如果新舊檔名不同）
        if new_path != jf:
            jf.unlink()

        print(f"  [OK] {jf.name} → {new_name}")

    print(f"\n完成：{len(json_files)} 個檔案處理完畢")


if __name__ == '__main__':
    main()
