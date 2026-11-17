"""Create a paired regional-station study report and larger spatial diagnostic."""
import argparse
import json
import math
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'ml/src'))


def mae_change(baseline, regional):
    """Describe the actual scores without assuming that more stations improve them."""
    if not all(math.isfinite(value) for value in (baseline, regional)):
        return 'MAE 無有效比較結果。'
    result = f'MAE {baseline:.4f} → {regional:.4f} µg/m³'
    if baseline > 0:
        delta = (regional - baseline) / baseline * 100
        result += f'，{"降低" if delta < 0 else "增加" if delta > 0 else "變化"} {abs(delta):.2f}%'
    return result + '。'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study-id', required=True)
    parser.add_argument('--spatial-hours', type=int, default=100)
    args = parser.parse_args()
    if args.spatial_hours < 1:
        parser.error('--spatial-hours must be positive')
    os.environ.update(OMP_NUM_THREADS='4',OPENBLAS_NUM_THREADS='4')
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from xgboost import XGBRegressor
    from taoyuan_ml import settings
    from taoyuan_ml.models.artifacts import sha256
    from taoyuan_ml.features.definitions import feature_columns, FEATURE_VERSION
    from taoyuan_ml.features.neighbors import find_nearest_stations
    from taoyuan_ml.evaluation.point_features import _build_station_features
    from taoyuan_ml.evaluation.metrics import _metrics, nonnegative_predictions

    settings.validate_id(args.study_id)
    out = settings.DATA_ROOT/'exports/ml'/args.study_id
    study = json.loads((out/'study.json').read_text(encoding='utf-8'))
    frames, models, counts = {}, {}, {}
    cols = feature_columns('pm25')
    for name in ['baseline','regional']:
        run_id = f'{args.study_id}-{name}'
        run = settings.DATA_ROOT/'models'/run_id
        metadata = json.loads((run/'metadata.json').read_text(encoding='utf-8'))
        if metadata['status'] != 'complete':
            raise ValueError('Study training is not complete.')
        if sha256(run/'config.toml') != metadata['config_sha256']:
            raise ValueError('Study configuration checksum mismatch.')
        saved_config = settings.read_config(run/'config.toml', snapshot=True)
        if saved_config['variables']['pm25'] != settings.VARIABLES['pm25']:
            raise ValueError('Set ML_CONFIG_FILE to the saved study config before generating its report.')
        schema = json.loads((run/'feature_schema.json').read_text(encoding='utf-8'))['xgb_pm25.json']
        if schema.get('feature_version') != FEATURE_VERSION or schema.get('features') != cols:
            raise ValueError('Study feature schema is incompatible with the current feature calculation.')
        path = settings.DATA_ROOT/'processed/ml'/metadata['dataset_id']/'pm25_hourly.parquet'
        if sha256(path) != metadata['dataset_manifest']['files'][path.name]['sha256']:
            raise ValueError('Study dataset checksum mismatch.')
        frames[name] = pd.read_parquet(path)
        model = XGBRegressor(n_jobs=4)
        model.load_model(bytearray((run/'xgb_pm25.json').read_bytes()))
        if list(model.get_booster().feature_names) != cols:
            raise ValueError('Model feature schema differs from study code.')
        models[name], counts[name] = model, metadata['split_rows']

    baseline = frames['baseline']
    temporal = pd.read_parquet(out/'paired_temporal_predictions.parquet')
    spatial_rows = []
    for sid in study['target_station_ids']:
        held = baseline[(baseline.station_id == sid) &
                        (baseline.monitor_date >= study['validation_end_exclusive']) &
                        (baseline.monitor_date < study['test_end_exclusive'])]
        if len(held)>args.spatial_hours:
            held = held.sample(args.spatial_hours,random_state=42)
        remaining = {name:frame[frame.station_id != sid] for name,frame in frames.items()}
        for row in held.itertuples():
            record = {'station_id':sid,'monitor_date':row.monitor_date,'pm25':row.pm25}
            for name, frame in remaining.items():
                _, point = _build_station_features(row.latitude,row.longitude,row.monitor_date,frame)
                if point is None:
                    break
                record[name] = float(nonnegative_predictions(models[name].predict(point))[0])
            if all(name in record for name in models):
                spatial_rows.append(record)
        print(f'Spatial paired diagnostic: {sid}',flush=True)
    spatial = pd.DataFrame(spatial_rows)
    if spatial.empty:
        raise ValueError('No paired spatial diagnostic cases.')
    spatial.to_csv(out/'paired_spatial_predictions.csv',index=False)

    summary, station_metrics, uncertainty = [], [], []
    for task, frame in [('temporal',temporal),('spatial',spatial)]:
        for name in models:
            summary.append({'task':task,'model':name,'n':len(frame),
                'high_cases':int((frame.pm25>=35).sum()), **_metrics(frame.pm25.to_numpy(),frame[name].to_numpy(),35.)})
        for sid, group in frame.groupby('station_id'):
            for name in models:
                station_metrics.append({'task':task,'station_id':sid,'model':name,'n':len(group),
                    **_metrics(group.pm25.to_numpy(),group[name].to_numpy(),35.)})
        # Paired block bootstrap by day, so stations/hours on a sampled day stay together.
        error_delta = (frame.regional-frame.pm25).abs()-(frame.baseline-frame.pm25).abs()
        daily = pd.DataFrame({'date':pd.to_datetime(frame.monitor_date).dt.date,'delta':error_delta}).groupby('date').delta.agg(['sum','count'])
        rng = np.random.default_rng(42)
        indexes = rng.integers(0,len(daily),size=(3000,len(daily)))
        deltas = daily['sum'].to_numpy()[indexes].sum(axis=1)/daily['count'].to_numpy()[indexes].sum(axis=1)
        uncertainty.append({'task':task,'mae_delta_regional_minus_baseline':float(error_delta.mean()),
            'daily_block_bootstrap_95_low':float(np.quantile(deltas,.025)),
            'daily_block_bootstrap_95_high':float(np.quantile(deltas,.975)), 'bootstrap_repeats':3000,'seed':42})
    summary = pd.DataFrame(summary)
    station_metrics = pd.DataFrame(station_metrics)
    summary.to_csv(out/'paired_metrics.csv',index=False)
    summary[summary.task=='spatial'].to_csv(out/'paired_spatial_metrics.csv',index=False)
    station_metrics.to_csv(out/'paired_station_metrics.csv',index=False)
    pd.DataFrame(uncertainty).to_csv(out/'uncertainty.csv',index=False)
    names = baseline.groupby('station_id').station_name.first().to_dict()
    meta = {}
    for name, frame in frames.items():
        meta[name] = frame.groupby('station_id')[['latitude','longitude']].first()
    changes = []
    old_neighbors = find_nearest_stations(meta['baseline'].reset_index())
    new_neighbors = find_nearest_stations(meta['regional'].reset_index())
    new_names = frames['regional'].groupby('station_id').station_name.first().to_dict()
    for sid in study['target_station_ids']:
        changes.append({'station':names[sid], 'baseline':','.join(names[x] for x in old_neighbors[sid]),
            'regional':','.join(new_names[x] for x in new_neighbors[sid]),
            'changed':old_neighbors[sid]!=new_neighbors[sid]})
    pd.DataFrame(changes).to_csv(out/'nearest_neighbor_changes.csv',index=False)

    figures = out/'figures'
    figures.mkdir(exist_ok=True)
    plt.rcParams['font.family'] = ['Microsoft JhengHei','DejaVu Sans']
    fig,ax = plt.subplots(figsize=(8,7))
    from shapely.geometry import shape
    boundary = shape(json.loads((ROOT/'frontend-web/src/data/map-assets/TOWN_MOI_1140318-taoyuan.json').read_text(encoding='utf-8')))
    def draw(geometry):
        if geometry.geom_type=='Polygon':
            x,y=geometry.exterior.xy
            ax.fill(x,y,facecolor='#edf1ee',edgecolor='#9aa89d',lw=.7,zorder=0)
        elif hasattr(geometry,'geoms'):
            for part in geometry.geoms: draw(part)
    draw(boundary)
    for name,color,label in [('baseline','#777777','原桃園測站'),('regional','#287849','新增鄰近測站')]:
        group=meta[name] if name=='baseline' else meta[name].loc[~meta[name].index.isin(meta['baseline'].index)]
        ax.scatter(group.longitude,group.latitude,c=color,s=45,label=label,zorder=3)
        for sid,row in group.iterrows():
            ax.annotate(new_names[sid],(row.longitude,row.latitude),xytext=(4,4),textcoords='offset points',fontsize=8)
    ax.set(xlabel='經度',ylabel='緯度',title='原桃園 10 站 + 新北／新竹 7 個鄰近站')
    ax.set_aspect(1/np.cos(np.deg2rad(25)))
    ax.legend(loc='lower left');fig.tight_layout();fig.savefig(figures/'station_coverage.png',dpi=160);plt.close(fig)

    fig,axes = plt.subplots(1,2,figsize=(12,5))
    for task,ax in zip(['temporal','spatial'],axes):
        table=station_metrics[station_metrics.task==task].pivot(index='station_id',columns='model',values='mae')
        table.index=[names[x] for x in table.index]
        table=table.rename(columns={'baseline':'原桃園 10 站','regional':'加入鄰近站'})
        table.plot.barh(ax=ax,color=['#a2a2a2','#287849'])
        ax.set(xlabel='MAE (µg/m³)',ylabel='',title='測站時間測試' if task=='temporal' else '地圖空間診斷')
        ax.grid(axis='x',alpha=.15)
    fig.tight_layout();fig.savefig(figures/'station_errors.png',dpi=160);plt.close(fig)

    def metric_table(task):
        lines=['| 模型 | MAE | RMSE | R² | 樣本數 |','|---|---:|---:|---:|---:|']
        for row in summary[summary.task==task].itertuples():
            lines.append(f'| {"原桃園 10 站" if row.model=="baseline" else "桃園 + 鄰近 7 站"} | {row.mae:.4f} | {row.rmse:.4f} | {row.r2:.4f} | {row.n:,} |')
        return lines
    temporal_rows=summary[summary.task=='temporal'].set_index('model')
    spatial_metrics=summary[summary.task=='spatial'].set_index('model')
    huaya=station_metrics[(station_metrics.task=='spatial') & (station_metrics.station_id=='0604816I0005')].set_index('model')
    huaya_note = ('- 華亞站空間診斷：' + mae_change(huaya.loc['baseline','mae'], huaya.loc['regional','mae']) if len(huaya)==2 else '')
    lines=['# 新北／新竹鄰近測站擴充實驗','',
        f'- Study：`{args.study_id}`。本報告不修改網站使用版本；部署狀態請以後端設定為準。',
        '- 新增林口、新莊、土城、板橋、湖口、竹東、新竹，合計 17 個 PM2.5 測站。',
        f'- {len(study["sources"])} 份官方年度區域壓縮檔；只讀取指定鄰站的逐時 PM2.5，不將無效標記、負數或缺值填成 0。',
        '- 擴充資料存於新的 ML Parquet 與 manifest，沒有改寫網站 PostgreSQL 資料表。',
        '- 新北／新竹站座標依官方 AQX_P_07，目前座標轉換至 WGS84；未重建歷年遷站紀錄，這是實驗限制。','',
        '![測站位置](figures/station_coverage.png)','',
        '## 比較方式','',
        '- 兩個模型都重新訓練：2019 至 2025-06-30 訓練，2025-07 至 09 月僅以桃園站做 early stopping；2025-10 至 12 月獨立測試，不參與訓練或 early stopping。',
        f'- 參數保持一致，僅增加資料中的鄰近站；random_state={saved_config["xgb"]["random_state"]}、最多 {saved_config["xgb"]["n_estimators"]} 棵樹、4 個 CPU 執行緒。',
        '- 保留原桃園站氣象數值；新增站沿用同一個最近 CWA 氣象站配對方法。本輪沒有同時更換氣象來源或超參數。',
        '- 鄰站特徵仍為最近 2 站的 1／24 小時 lag；地圖推估的 IDW 特徵可使用所有可用站。',
        '- 所有比較只在桃園測站、相同 station/hour 的交集計算，避免外縣市樣本或樣本缺漏讓平均分數失真。',
        f'- 樣本數：baseline `{counts["baseline"]}`；regional `{counts["regional"]}`。差異與剔除缺值後覆蓋率一併保留。','',
        '## 測站時間測試','',*metric_table('temporal'),' ',
        '## 地圖空間診斷','',
        f'- 固定種子，每個桃園站抽取最多 {args.spatial_hours} 個獨立測試期時刻。移除目標站所有歷史／當下特徵輸入，再由其餘站估計該點。',
        '- 這裡沿用已訓練模型，沒有逐站重新訓練；不能視為完整未見測站泛化測試。它檢查歷史地圖空間補值用途。','',
        *metric_table('spatial'),' ',
        '![各站誤差](figures/station_errors.png)','',
        '## 結果與限制','',
        '- 空間診斷：' + mae_change(spatial_metrics.loc['baseline','mae'], spatial_metrics.loc['regional','mae']),
        huaya_note,
        '- 測站時間測試：' + mae_change(temporal_rows.loc['baseline','mae'], temporal_rows.loc['regional','mae']) + '不能宣稱加入站點就保證提高精確度。',
        '- 不確定性：以下以日為區塊重抽 3,000 次，估計「regional MAE − baseline MAE」。負數表示擴充模型較好；區間包含 0 時證據不足以判定改善穩定。','',
        '```text',pd.DataFrame(uncertainty).to_string(index=False),'```','',
        f'- 空間診斷中 PM2.5 ≥ 35 的樣本只有 {int(spatial_metrics.loc["baseline","high_cases"])} 筆，高污染召回率不適合單獨作為模型選擇依據。',
        '- 此實驗的新增站年度資料僅使用至 2025 年；網站是否延伸推估期間，須另外檢查部署版本，不能由此報告判定。',
        '- 後續優先補齊 2026 年鄰站資料與歷年遷站資料，再用不同年份／季節的獨立資料驗證穩定性。',
        '- 本流程是歷史空間推估，不是未來預報；當下其他站觀測可供歷史補值使用。','',
        '## 重現','',
        '```powershell',
        '.\\ml\\.venv\\Scripts\\python.exe scripts/download_moe_regional_history.py --years 2019 2020 2021 2022 2023 2024 2025',
        '.\\ml\\.venv\\Scripts\\python.exe scripts/train_regional_pm25.py --base-dataset-id meteo-20261113-v1 --study-id NEW_STUDY --spatial-hours 30',
        '.\\ml\\.venv\\Scripts\\python.exe scripts/report_regional_pm25.py --study-id NEW_STUDY --spatial-hours 100',
        '```','',
        '下載工具需 requests（見 scripts/requirements.txt）；訓練／報告使用已安裝的 ml 套件與 backend/.env 資料庫設定。',
        '比較用 run 的 study.json／metadata 區段記錄三段時間切分；直接改用一般 train 指令不會自動重現本實驗的獨立測試切分。','',
        '來源：[環境部歷年監測資料](https://airtw.moenv.gov.tw/CHT/Query/His_Data.aspx)、[官方測站基本資料](https://data.gov.tw/en/datasets/6075)。','']
    (out/'REPORT.md').write_text('\n'.join(lines),encoding='utf-8')
    print(summary.to_string(index=False),flush=True)
    print('Report:',out/'REPORT.md',flush=True)


if __name__ == '__main__':
    main()
