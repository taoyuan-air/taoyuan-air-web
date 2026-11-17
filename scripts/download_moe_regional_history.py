"""Download official annual MOE archives for northern and Hsinchu/Miaoli regions.

No API key is required. Archives are retained as sources; nothing is extracted.
"""
import argparse
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import zipfile

import requests

INDEX_URL = 'https://airtw.moenv.gov.tw/CHT/Query/His_Data.aspx'


class FormInputs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'input' and attrs.get('type') == 'hidden' and attrs.get('name'):
            self.values[attrs['name']] = attrs.get('value', '')


def regional_links(document):
    links = {}
    for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', document, re.S | re.I):
        for region, code in [('北部空品區', 'north'), ('竹苗空品區', 'hsinchu-miaoli')]:
            if region in html.unescape(re.sub('<[^>]+>', '', row)):
                match = re.search(r'https://drive\.google\.com/file/d/([\w-]+)/', row)
                if match:
                    links[code] = match.group(1)
    if len(links) != 2:
        raise RuntimeError('Official archive page structure changed; regional links not found.')
    return links


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--years', type=int, nargs='+', required=True)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1]/'data/raw/moe-regional')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with requests.Session() as session:
        for year in sorted(set(args.years)):
            response = session.get(INDEX_URL, timeout=60)
            response.raise_for_status()
            response.encoding = 'utf-8'
            form = FormInputs()
            form.feed(response.text)
            form.values.update({'ctl00$CPH_Content$ddlQYear': str(year), 'ctl00$CPH_Content$btnQuery': '查詢'})
            response = session.post(INDEX_URL, data=form.values, timeout=60)
            response.raise_for_status()
            response.encoding = 'utf-8'
            # Confirm the server actually selected the requested year.
            if not re.search(rf'<option selected="selected" value="{year}">', response.text):
                raise RuntimeError(f'Official archive did not select requested year {year}.')
            for region, file_id in regional_links(response.text).items():
                target = args.output/f'{year}-{region}.zip'
                if target.exists() and zipfile.is_zipfile(target):
                    print(f'Already downloaded: {target.name}', flush=True)
                    continue
                url = f'https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t'
                temporary = target.with_suffix('.zip.part')
                print(f'Downloading {year} {region} ...', flush=True)
                digest = hashlib.sha256()
                with session.get(url, stream=True, timeout=(30, 180)) as archive:
                    archive.raise_for_status()
                    with temporary.open('wb') as stream:
                        for block in archive.iter_content(1024*1024):
                            stream.write(block)
                            digest.update(block)
                if not zipfile.is_zipfile(temporary):
                    raise RuntimeError(f'{target.name}: download is not a ZIP archive; check public download availability.')
                temporary.replace(target)
                (target.with_suffix('.source.json')).write_text(json.dumps({
                    'index_url': INDEX_URL, 'year': year, 'region': region,
                    'archive_url': f'https://drive.google.com/file/d/{file_id}/view',
                    'sha256': digest.hexdigest(), 'bytes': target.stat().st_size,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'Saved {target.name}: {target.stat().st_size/1e6:.1f} MB', flush=True)


if __name__ == '__main__':
    main()
