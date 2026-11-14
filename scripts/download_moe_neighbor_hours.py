"""Download 2026 PM2.5 hours using officially published MOE API resources.

Uses MOE_API_KEY if supplied, otherwise the anonymous resource link intentionally
published on data.gov.tw. API tokens are never saved in provenance or logs.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import html
from html.parser import HTMLParser
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import requests

STATIONS = {'197':'9','195':'7','193':'5','194':'6','210':'22','211':'23','212':'24'}


def exclusive_end(value):
    """The API filters by calendar date; partial days and offsets cannot be honored."""
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise argparse.ArgumentTypeError('--end must be a local date in YYYY-MM-DD format.')
    try:
        end = datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        raise argparse.ArgumentTypeError('--end must be a valid calendar date.') from None
    if not datetime(2026, 1, 1) < end <= datetime(2027, 1, 1):
        raise argparse.ArgumentTypeError('--end must be after 2026-01-01 and no later than 2027-01-01.')
    return end


def deduplicate_records(records):
    groups={}
    for record in records:
        groups.setdefault(record['monitordate'],[]).append(record)
    clean=[]; conflicts={}; identical=0
    for timestamp, group in sorted(groups.items()):
        values={str(record.get('concentration','')).strip() for record in group}
        if len(values)>1:
            conflicts[timestamp]=sorted(values)
        else:
            clean.append(group[0]);identical+=len(group)-1
    return clean, {'identical_duplicate_records_removed':identical,'conflicting_hours_excluded':conflicts}


def fetch_period(session,key,dataset,sid,start,stop):
    lower=(start-timedelta(minutes=1)).strftime('%Y-%m-%d %H:%M')
    try:
        response=session.get(f'https://data.moenv.gov.tw/api/v2/aqx_p_{dataset}',params={
            'api_key':key,'format':'json','limit':1000,
            'filters':f'MonitorDate,GR,{lower}|MonitorDate,LE,{stop:%Y-%m-%d}|ItemEngName,EQ,PM2.5'},timeout=90)
    except requests.RequestException:
        # Requests exceptions may contain the full URL, including api_key.
        raise RuntimeError(f'AQX_P_{dataset}: request failed; retry the download.') from None
    if response.status_code!=200: raise RuntimeError(f'AQX_P_{dataset}: HTTP {response.status_code}')
    try:
        page=response.json()
    except ValueError:
        raise ValueError(f'AQX_P_{dataset}: response is not valid JSON.') from None
    page=page.get('records') if isinstance(page,dict) else page
    if not isinstance(page,list): raise ValueError('Unexpected MOE response type.')
    if len(page)>=1000:
        days=(stop-start).days
        if days<=1: raise ValueError('Daily response exceeds limit; inspect source filters.')
        middle=start+timedelta(days=days//2)
        return fetch_period(session,key,dataset,sid,start,middle)+fetch_period(session,key,dataset,sid,middle,stop)
    result=[]
    for record in page:
        if str(record.get('siteid'))!=sid or record.get('itemengname')!='PM2.5':
            raise ValueError('Station/pollutant filter mismatch.')
        time=datetime.fromisoformat(record['monitordate'])
        if time<start or time>stop: raise ValueError('MOE returned records outside requested period.')
        if time<stop: result.append(record)
    return result


class PublicResources(HTMLParser):
    def __init__(self):
        super().__init__(); self.key = None

    def handle_starttag(self, tag, attrs):
        if tag != 'a': return
        url = urlsplit(html.unescape(dict(attrs).get('href','')))
        if url.hostname == 'data.moenv.gov.tw' and url.path.lower() == '/api/v2/aqx_p_07':
            self.key = parse_qs(url.query).get('api_key',[self.key])[0]


def verify_cached_download(path, end, sid, dataset):
    """Resume only matching, complete downloads; never silently reuse an older period."""
    checksum = path.with_suffix('.sha256')
    content = path.read_bytes()
    if not checksum.exists() or hashlib.sha256(content).hexdigest() != checksum.read_text(encoding='ascii').strip():
        raise ValueError(f'{path.name}: cached checksum missing or mismatched; use a new output directory.')
    payload = json.loads(content)
    if (payload.get('requested_end_exclusive') != end or payload.get('station_id') != sid
            or payload.get('dataset') != f'AQX_P_{dataset}'):
        raise ValueError(f'{path.name}: cached period or station differs; use a new output directory.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--end', type=exclusive_end, required=True, help='Exclusive local date, e.g. 2026-11-15')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    end=args.end
    end_key=end.strftime('%Y-%m-%d')
    start=datetime(2026,1,1)
    args.output.mkdir(parents=True,exist_ok=True)
    with requests.Session() as session:
        key=os.environ.get('MOE_API_KEY')
        if not key:
            response=session.get('https://data.gov.tw/en/datasets/6075',timeout=60)
            if response.status_code!=200: raise RuntimeError('Official public resource list unavailable.')
            resources=PublicResources();resources.feed(response.text);key=resources.key
        if not key: raise RuntimeError('Set MOE_API_KEY; official anonymous resource link is unavailable.')
        for dataset,sid in STATIONS.items():
            target=args.output/f'aqx_p_{dataset}.json'
            if target.exists():
                verify_cached_download(target, end_key, sid, dataset)
                print(f'Already exists: {target.name}',flush=True);continue
            records=[]
            month=start
            while month<end:
                following=datetime(month.year+1,1,1) if month.month==12 else datetime(month.year,month.month+1,1)
                stop=min(following,end)
                page=fetch_period(session,key,dataset,sid,month,stop)
                records.extend(page)
                print(f'AQX_P_{dataset} {month:%Y-%m}: {len(page)} records',flush=True)
                month=following
            if not records: raise ValueError(f'AQX_P_{dataset}: no 2026 records.')
            raw_records=records
            records,quality=deduplicate_records(raw_records)
            if not records: raise ValueError(f'AQX_P_{dataset}: no unambiguous hours remain after deduplication.')
            timestamps=[r['monitordate'] for r in records]
            payload={'dataset':f'AQX_P_{dataset}','station_id':sid,'source_url':f'https://data.moenv.gov.tw/dataset/detail/AQX_P_{dataset}',
                'downloaded_at':datetime.now(timezone.utc).isoformat(),'requested_end_exclusive':end_key,
                'first':min(timestamps),'last':max(timestamps),'quality':quality,'records':records,'raw_records':raw_records}
            content=json.dumps(payload,ensure_ascii=False).encode('utf-8')
            target.write_bytes(content)
            target.with_suffix('.sha256').write_text(hashlib.sha256(content).hexdigest()+'\n',encoding='ascii')
            print(f'Saved {target.name}: {len(records)} hours, {payload["first"]} to {payload["last"]}',flush=True)


if __name__=='__main__': main()
