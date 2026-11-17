'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { API_BASE } from '@/lib/apiBase';
import type { HistoryGrid } from '@/components/map/HistoricalPM25Map';
import { AuthGuard } from '@/components/auth/AuthGuard';
import styles from './history.module.css';
import { PM25_BANDS, pm25Color, pm25BandGradient } from '@/lib/pm25Palette';
import HistoryTimePicker from '@/components/map/HistoryTimePicker';
import TrainingReport from '@/components/map/TrainingReport';
import * as Popover from '@radix-ui/react-popover';
import { ArrowDownToLine, ArrowRight, ChartNoAxesCombined, Info, LoaderCircle, SlidersHorizontal } from 'lucide-react';

const HistoryMap = dynamic(() => import('@/components/map/HistoricalPM25Map'), { ssr: false });
type Catalog = { dates: Record<string, string[]>; run_id: string; legend: { color: string; range: string }[] };

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.detail === 'string' ? body.detail : `服務暫時無法使用（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export default function HistoryPage() {
  const [reportOpen, setReportOpen] = useState(false);
  const closeReport = useCallback(() => setReportOpen(false), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [date, setDate] = useState('');
  const [hour, setHour] = useState('');
  const [data, setData] = useState<HistoryGrid | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  async function load(time: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setData(null);
    try {
      const result = await fetch(`${API_BASE}/ml/history/grid?time=${encodeURIComponent(time)}`, { signal: controller.signal });
      const grid = await readResponse<HistoryGrid>(result);
      if (!controller.signal.aborted) setData({ ...grid, features: grid.features.map(feature => ({
        ...feature, properties: { ...feature.properties, color: pm25Color(feature.properties.pm25) },
      })) });
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '無法載入歷史網格。');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/ml/history/catalog`, { signal: controller.signal })
      .then(readResponse<Catalog>).then(value => {
        if (controller.signal.aborted) return;
        const dates = Object.keys(value.dates).sort();
        if (!dates.length) throw new Error('目前沒有可用的歷史資料。');
        const latest = dates[dates.length - 1];
        const hours = value.dates[latest];
        const initialHour = hours.includes('14:00') ? '14:00' : hours[hours.length - 1];
        setCatalog(value); setDate(latest); setHour(initialHour);
        void load(`${latest}T${initialHour}`);
      }).catch(cause => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '無法載入資料目錄。'); setBusy(false);
        }
      });
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  const dates = catalog ? Object.keys(catalog.dates).sort() : [];
  const hours = catalog?.dates[date] ?? [];
  function downloadGrid() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/geo+json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taoyuan-pm25-${data.metadata.timestamp.slice(0, 13).replace(/[:T]/g, '-')}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <AuthGuard><div className={`${styles.workspace} ${reportOpen ? styles.reportOpen : ''}`}><div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.identity}>
        <div><h1>桃園歷史 PM<sub>2.5</sub></h1><p>小時濃度推估 <span>·</span> 3 km × 3 km 網格</p></div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.reportButton} aria-expanded={reportOpen} aria-controls="training-report" onClick={() => setReportOpen(value => !value)}><ChartNoAxesCombined size={15} />訓練成果</button>
        <button type="button" onClick={downloadGrid} disabled={!data} className={styles.download} aria-label="下載目前時刻 GeoJSON"><ArrowDownToLine size={15} /><span>下載 GeoJSON</span></button>
        <Popover.Root>
          <Popover.Trigger asChild><button type="button" className={styles.infoButton} aria-label="查看地圖說明"><Info size={18} /></button></Popover.Trigger>
          <Popover.Portal><Popover.Content className={styles.detailsPanel} sideOffset={10} align="end" collisionPadding={12} aria-label="地圖說明">
            <h2>關於這張地圖</h2>
            <p>以台灣時間顯示小時 PM2.5 空間推估，每格 3 km × 3 km，邊界依桃園市界裁切。</p>
            <p>配色每 2 µg/m³ 一階，由淺至深，跨日期固定；七大濃度區間參考日空氣品質指標文件。本圖不是日 AQI 或 24 小時平均。</p>
            <p>網格值為格內代表點推估。離測站較遠的地區，尤其南部山區，請審慎解讀。</p>
            {dates.length > 0 && <p>可用日期：{dates[0]} 至 {dates[dates.length - 1]}。</p>}
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
    </header>
    <div className={styles.queryBar}>
      <span className={styles.queryLabel}><SlidersHorizontal size={16} />查詢時刻</span>
      <form className={styles.form} onSubmit={event => {
        event.preventDefault();
        if (hours.includes(hour)) void load(`${date}T${hour}`);
      }}>
        <HistoryTimePicker date={date} hour={hour} dates={dates} hours={hours} onDateChange={next => {
            const nextHours = catalog?.dates[next] ?? [];
            setDate(next);
            setHour(nextHours.includes(hour) ? hour : nextHours[0] ?? '');
          }} onHourChange={setHour} />
        <button disabled={busy || !hours.includes(hour)} type="submit">{busy ? <><LoaderCircle size={15} className={styles.spinner} />載入中</> : <>更新資料<ArrowRight size={15} /></>}</button>
      </form>
    </div>
    <section className={styles.map} aria-label="歷史空間分布" aria-busy={busy}>
      <HistoryMap data={data} />
      <div aria-live="polite" className={styles.status}>
      {busy ? '正在載入網格，首次查詢約需 10–30 秒…' : error ? <span role="alert" className={styles.error}>{error}</span> : catalog && !hours.length ?
        '此日期沒有足夠資料，請選擇其他日期。' : data ?
        <><span className={styles.statusDot} /><span>{data.metadata.timestamp.slice(0, 16).replace('T', ' · ')}</span><span className={styles.statusHint}>點擊網格查看詳情</span></> : '請選擇日期與時間。'}
      </div>
    <aside className={styles.legend} aria-label="PM2.5 濃度分段色階，數字標示各級切點，各色段等高">
      <span className={styles.legendTitle}>PM2.5<span>µg/m³</span></span>
      <div className={styles.legendScale}>
        <span className={styles.legendTop}>≥ {PM25_BANDS[PM25_BANDS.length - 1].upper}</span>
        {[...PM25_BANDS].reverse().map(item => <div key={item.lower} className={styles.legendBand} aria-label={`${item.range} µg/m³`}>
          <span className={styles.swatch} style={{ background: pm25BandGradient(item, 'to top') }} /><span className={styles.legendTick}>{item.lower}</span>
        </div>)}
      </div>
      <span className={styles.legendNote}>分段刻度</span>
    </aside>
    </section>
  </div>{reportOpen && <TrainingReport onClose={closeReport} />}</div></AuthGuard>;
}
