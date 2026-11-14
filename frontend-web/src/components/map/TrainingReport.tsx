'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { API_BASE } from '@/lib/apiBase';
import styles from './TrainingReport.module.css';

type Model = 'baseline' | 'regional';
type Task = 'temporal' | 'spatial';
type Metric = { task: Task; model: Model; n: number; mae: number | null; rmse: number | null; r2: number | null };
type Report = {
  active_run_id: string; training_run_id: string; inference_extension: boolean;
  study: null | {
    study_id: string; train_end_exclusive: string; validation_end_exclusive: string; test_end_exclusive: string;
    neighbors: { station_name: string; county: string }[];
    versions: { model: Model; run_id: string; station_count: number; source_rows: number; time_start: string;
      split_rows: { train: number; validation_taoyuan: number; test_taoyuan: number } }[];
    metrics: Metric[];
    uncertainty: { task: Task; low: number | null; high: number | null; repeats: number }[];
  };
};

const number = (value: number) => value.toLocaleString('zh-TW');
const score = (value: number | null | undefined) => value == null ? '—' : value.toFixed(3);
const shortDate = (value: string) => value.slice(0, 10).replaceAll('-', '/');

function Comparison({ study, task }: { study: NonNullable<Report['study']>; task: Task }) {
  const baseline = study.metrics.find(row => row.task === task && row.model === 'baseline');
  const regional = study.metrics.find(row => row.task === task && row.model === 'regional');
  if (!baseline || !regional) return <p>尚無此項比較結果。</p>;
  const improvement = baseline.mae != null && baseline.mae > 0 && regional.mae != null
    ? (baseline.mae - regional.mae) / baseline.mae * 100 : null;
  const interval = study.uncertainty.find(row => row.task === task);
  const maximum = Math.max(baseline.mae ?? 0, regional.mae ?? 0);
  return <section className={styles.section}>
    <div className={styles.sectionHeading}><h3>{task === 'spatial' ? '地圖空間診斷' : '測站時間測試'}</h3><span>配對樣本 {number(baseline.n)} 筆</span></div>
    <p>{task === 'spatial' ? '移除目標站的觀測輸入，由其餘測站估計該點，檢查地圖補值表現。' : '在獨立測試期間，比較相同桃園測站、相同時刻的預測誤差。'}</p>
    {improvement !== null && <div className={`${styles.finding} ${improvement > 0 ? styles.improved : styles.neutral}`}>
      <span>MAE {improvement > 0 ? '降低' : improvement < 0 ? '增加' : '不變'}</span><strong>{Math.abs(improvement).toFixed(2)}<small>%</small></strong>
    </div>}
    <div className={styles.bars} aria-hidden="true">{[baseline, regional].map(row => <div key={row.model} className={styles.barRow}>
      <span>{row.model === 'baseline' ? '桃園' : '加入鄰站'}</span>
      <div className={styles.barTrack}><div className={row.model === 'regional' ? styles.regionalBar : styles.baselineBar} style={{ width: `${maximum ? (row.mae ?? 0) / maximum * 100 : 0}%` }} /></div>
      <span>{score(row.mae)}</span>
    </div>)}</div>
    <table className={styles.table}>
      <caption className={styles.srOnly}>{task === 'spatial' ? '空間診斷' : '時間測試'}指標比較；MAE 與 RMSE 單位為 µg/m³</caption>
      <thead><tr><th scope="col">指標</th><th scope="col">桃園 {study.versions[0].station_count} 站</th><th scope="col">加入鄰站</th></tr></thead>
      <tbody>{(['mae', 'rmse', 'r2'] as const).map(key => <tr key={key}><th scope="row">{key === 'r2' ? 'R² ↑' : `${key.toUpperCase()} ↓`}</th><td>{score(baseline[key])}</td><td>{score(regional[key])}</td></tr>)}</tbody>
    </table>
    <p className={styles.note}>MAE／RMSE 越低越好（µg/m³）；R² 越高越好。</p>
    {interval && <p className={styles.note}>MAE 差值（加入鄰站 − 桃園）的 95% 區間：{score(interval.low)} 至 {score(interval.high)}；以日為區塊重抽 {number(interval.repeats)} 次。{interval.low != null && interval.high != null && (interval.low <= 0 && interval.high >= 0 ? '區間包含 0，改善證據不足。' : interval.high < 0 ? '區間低於 0，支持本次評估的誤差下降。' : '區間高於 0，顯示本次誤差增加。')}</p>}
  </section>;
}

export default function TrainingReport({ onClose }: { onClose: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/ml/history/training-report`, { signal: controller.signal }).then(async response => {
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : '無法載入訓練成果。');
      }
      return response.json() as Promise<Report>;
    }).then(value => { if (!controller.signal.aborted) setReport(value); }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '無法載入訓練成果。');
    });
    return () => controller.abort();
  }, [attempt]);
  const study = report?.study;
  return <aside id="training-report" className={styles.panel} aria-labelledby="training-report-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>模型評估報告</span><h2 id="training-report-title">訓練成果</h2></div>
      <button ref={close} type="button" onClick={onClose} className={styles.close} aria-label="關閉訓練成果"><X size={20} /></button>
    </header>
    <div className={styles.content}>
      {!report && !error && <p role="status">正在讀取訓練成果…</p>}
      {error && <div role="alert"><p>{error}</p><button className={styles.retry} type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>重新載入</button></div>}
      {report && <>
        <section className={styles.section}>
          <h3>目前展示版本</h3><code className={styles.runId}>{report.active_run_id}</code>
          <p>歷史 PM2.5 空間推估 · XGBoost · 3 km × 3 km 網格</p>
          {report.inference_extension && <p className={styles.note}>目前版本延長了推估資料期間，沿用既有訓練權重，未以新增觀測重新訓練。以下分數屬於原獨立測試期間。</p>}
          {report.training_run_id !== report.active_run_id && <p className={styles.note}>訓練版本 <code>{report.training_run_id}</code></p>}
        </section>
        {!study && <p>此模型尚未附上版本比較實驗，請切換至具有比較報告的模型版本。</p>}
        {study && <>
          <section className={styles.section}>
            <h3>實驗設計：加入鄰近縣市測站</h3>
            <div className={styles.versions}>{study.versions.map(version => <div key={version.model}>
              <span>{version.model === 'baseline' ? '基準模型' : '擴充模型'}</span><strong>{version.station_count}<small> 站</small></strong><p>{version.model === 'baseline' ? '桃園測站' : '桃園＋新北／新竹'}</p>
            </div>)}</div>
            <p>新增{study.neighbors.map(station => station.station_name).join('、')}。兩版本使用相同參數與氣象配對策略，比較時只取桃園相同測站／時刻的交集。</p>
            <div className={styles.timeline}>
              <div><span>訓練</span><strong>{shortDate(study.train_end_exclusive)} 前</strong><small>來源觀測自 {shortDate(study.versions[0].time_start)}；剔除缺少特徵的樣本</small></div>
              <div><span>驗證</span><strong>{shortDate(study.train_end_exclusive)} 起</strong><small>至 {shortDate(study.validation_end_exclusive)} 前 · early stopping</small></div>
              <div><span>獨立測試</span><strong>{shortDate(study.validation_end_exclusive)} 起</strong><small>至 {shortDate(study.test_end_exclusive)} 前</small></div>
            </div>
            <table className={styles.table}>
              <caption>資料量（筆）</caption>
              <thead><tr><th scope="col">資料階段</th><th scope="col">桃園</th><th scope="col">加入鄰站</th></tr></thead>
              <tbody>{([
                ['來源觀測', (v: typeof study.versions[number]) => v.source_rows],
                ['訓練樣本', (v: typeof study.versions[number]) => v.split_rows.train],
                ['驗證樣本', (v: typeof study.versions[number]) => v.split_rows.validation_taoyuan],
                ['測試樣本', (v: typeof study.versions[number]) => v.split_rows.test_taoyuan],
              ] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{study.versions.map(v => <td key={v.model}>{number(value(v))}</td>)}</tr>)}</tbody>
            </table>
            <p className={styles.note}>訓練樣本已剔除缺少模型特徵的資料。驗證與測試只使用桃園站；下方比較另取兩版本共同樣本。</p>
          </section>
          <Comparison study={study} task="spatial" />
          <Comparison study={study} task="temporal" />
          <section className={styles.section}><h3>成果解讀與限制</h3>
            <ul><li>空間診斷沿用已訓練模型，沒有逐站重新訓練，不能視為完全未見測站的泛化測試。</li><li>加入鄰站的效果需分別觀察時間測試與空間診斷，不能僅因站數增加便宣稱全面提升。</li><li>本圖呈現歷史空間補值；山區等遠離測站區域仍需審慎解讀。高污染樣本較少，需擴大驗證。</li></ul>
          </section>
          <footer className={styles.source}>實驗編號 <code>{study.study_id}</code><br />數據來源：模型 metadata、配對評估與日區塊 bootstrap 報告。切換地圖時刻不會重新訓練或改變評估分數。</footer>
        </>}
      </>}
    </div>
  </aside>;
}
