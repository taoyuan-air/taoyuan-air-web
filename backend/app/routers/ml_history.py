"""Serve cached historical GeoJSON; generate missing hours using isolated ML Python."""
import json
import logging
import os
import re
import subprocess
import threading
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from ..config import settings
from .ml_training_report import training_report

router = APIRouter(prefix='/ml/history', tags=['ml-history'])
ROOT = Path(__file__).resolve().parents[3]
RUN_ID = settings.ML_HISTORY_RUN_ID
if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,99}', RUN_ID):
    raise ValueError('Invalid ML_HISTORY_RUN_ID')
DATA_ROOT = Path(settings.ML_DATA_ROOT or ROOT/'data').resolve()
DIRECTORY = DATA_ROOT/'exports/ml'/RUN_ID/'history-map-v1'
PYTHON = Path(settings.ML_PYTHON or ROOT/'ml/.venv'/('Scripts/python.exe' if os.name == 'nt' else 'bin/python'))
_lock = threading.Lock()
logger = logging.getLogger(__name__)


def catalog():
    try:
        return json.loads((DIRECTORY/'catalog.json').read_text(encoding='utf-8'))
    except FileNotFoundError:
        raise HTTPException(503, '尚未準備歷史資料目錄，請先執行 history-map --catalog。')


@router.get('/catalog')
def get_catalog():
    return catalog()


@router.get('/training-report')
def get_training_report():
    try:
        return training_report(DATA_ROOT, RUN_ID)
    except (OSError, ValueError, KeyError, TypeError):
        logger.exception('Cannot read historical model training report')
        raise HTTPException(503, '訓練成果尚未備齊，請確認模型與比較報告已產生。')


@router.get('/grid')
def get_grid(time: str = Query(..., pattern=r'^\d{4}-\d{2}-\d{2}T\d{2}:00$')):
    try:
        target = datetime.strptime(time, '%Y-%m-%dT%H:%M')
    except ValueError:
        raise HTTPException(422, '日期格式不正確。')
    available = catalog()
    if target.strftime('%H:00') not in available['dates'].get(target.strftime('%Y-%m-%d'), []):
        raise HTTPException(404, '此時刻沒有足夠的歷史測站資料。')
    path = DIRECTORY/f'{target:%Y%m%d_%H00}.geojson'
    if not path.exists():
        if not _lock.acquire(blocking=False):
            raise HTTPException(503, '另一時刻正在計算，請稍後再試。', headers={'Retry-After': '10'})
        try:
            if not path.exists():
                if not PYTHON.is_file():
                    raise HTTPException(503, '尚未設定 ML Python 環境。')
                env = os.environ.copy()
                env.update(PYTHONIOENCODING='utf-8', OMP_NUM_THREADS='4', OPENBLAS_NUM_THREADS='4')
                try:
                    process = subprocess.run([str(PYTHON), '-m', 'taoyuan_ml',
                        '--data-root', str(DATA_ROOT), '--run-id', RUN_ID,
                        'history-map', '--time', time], cwd=ROOT, env=env,
                        capture_output=True, timeout=120)
                except subprocess.TimeoutExpired:
                    raise HTTPException(504, '計算逾時，請稍後再試。')
                except OSError:
                    raise HTTPException(503, '無法啟動 ML Python，請檢查執行環境。')
                if process.returncode or not path.exists():
                    logger.error('Historical ML generation failed (exit %s)', process.returncode)
                    raise HTTPException(503, '此時刻推估失敗，請選擇其他時刻或檢查 ML 執行環境。')
        finally:
            _lock.release()
    return FileResponse(path, media_type='application/geo+json; charset=utf-8')
