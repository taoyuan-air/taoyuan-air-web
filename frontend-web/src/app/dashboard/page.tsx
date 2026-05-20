'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '@shared/store';
import { getGrid, getAlerts, getEvents, setScenario } from '@shared/api/index';
import { fetchMoeStations } from '@shared/api/moe';
import {
  EPA_STATION_TO_DISTRICT, DISTRICT_STATIC_AQ,
  DISTRICTS, findNearestDistrict,
} from '@shared/constants/districts';

// ── Design tokens ──────────────────────────────────────────────────────
const C = {
  rose: '#D4567A', roseMid: '#C2446A',
  roseLt: 'rgba(212,86,122,0.12)', roseGlow: 'rgba(212,86,122,0.22)',
  roseBorder: 'rgba(212,86,122,0.30)',
  sky: '#5BA0C8', mint: '#37A085', amber: '#B87820',
  glass: 'rgba(255,255,255,0.52)', glass2: 'rgba(255,255,255,0.32)',
  glassBorder: 'rgba(255,255,255,0.72)', glassBorder2: 'rgba(255,255,255,0.50)',
  glassShadow: 'rgba(180,140,160,0.14)', glassInner: 'rgba(255,255,255,0.80)',
  text: '#1a1220', muted: '#7a6880', hint: '#b0a0b8',
};

const GAUGE_SIZE = 200, STROKE_W = 11;
const GAUGE_R = (GAUGE_SIZE - STROKE_W) / 2;
const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;

const getAQIStatus = (aqi: number) => {
  if (aqi <= 50) return '良好';
  if (aqi <= 100) return '普通';
  if (aqi <= 150) return '敏感族群';
  if (aqi <= 200) return '不健康';
  return '危害';
};
const getPM25Color = (v: number) => v <= 12 ? C.rose : v <= 35 ? C.amber : C.roseMid;
const getO3Color = (v: number) => v <= 54 ? C.mint : C.amber;
const getNO2Color = (v: number) => v <= 53 ? C.sky : C.amber;
const getActivityInfo = (pm25: number) => {
  if (pm25 <= 12) return '空氣清新，非常適合戶外運動，盡情享受戶外活動！';
  if (pm25 <= 35) return '當前 PM2.5 濃度適合戶外活動，敏感族群無需特殊防護。';
  if (pm25 <= 55) return '空氣品質普通，敏感族群建議減少長時間戶外活動。';
  return '空氣品質不佳，建議外出配戴口罩，敏感族群避免戶外活動。';
};

function AQIGauge({ aqi }: { aqi: number }) {
  const pct = Math.min(Math.max(aqi / 200, 0), 1);
  const offset = GAUGE_CIRC * (1 - pct);
  const cx = GAUGE_SIZE / 2, cy = GAUGE_SIZE / 2;
  return (
    <div style={{ width: GAUGE_SIZE, height: GAUGE_SIZE, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={GAUGE_SIZE} height={GAUGE_SIZE} style={{ position: 'absolute' }}>
        <defs>
          <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F48FB1" />
            <stop offset="100%" stopColor={C.rose} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={GAUGE_R} stroke={C.roseLt} strokeWidth={STROKE_W} fill="none" />
        <circle cx={cx} cy={cy} r={GAUGE_R} stroke="url(#rg)" strokeWidth={STROKE_W} fill="none"
          strokeDasharray={GAUGE_CIRC} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90, ${cx}, ${cy})`} />
      </svg>
      <div style={{
        width: GAUGE_SIZE - 60, height: GAUGE_SIZE - 60, borderRadius: '50%',
        backgroundColor: C.glass, border: `1px solid ${C.glassInner}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 3px 12px ${C.glassShadow}`,
      }}>
        <span style={{ fontSize: 9, color: C.hint, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: 'monospace' }}>AQI</span>
        <span style={{ fontSize: 40, fontWeight: 800, color: C.rose, lineHeight: 1.1 }}>{aqi}</span>
        <span style={{ marginTop: 5, padding: '3px 10px', borderRadius: 999, backgroundColor: C.roseLt, border: `1px solid ${C.roseBorder}`, fontSize: 11, fontWeight: 700, color: C.rose }}>
          {getAQIStatus(aqi)}
        </span>
      </div>
    </div>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ backgroundColor: C.glass, border: `1px solid ${C.glassBorder}`, borderRadius: 18, padding: 20, boxShadow: `0 4px 20px ${C.glassShadow}`, ...style }}>
      {children}
    </div>
  );
}

function SecLabel({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
      <div style={{ width: 3, height: 14, backgroundColor: C.rose, borderRadius: 2 }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
    </div>
  );
}

function PollBar({ name, nameEn, value, max, color, unit }: { name: string; nameEn: string; value: number; max: number; color: string; unit: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 54 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{nameEn}</div>
        <div style={{ fontSize: 9, color: C.hint, marginTop: 1 }}>{name}</div>
      </div>
      <div style={{ flex: 1, height: 5, backgroundColor: 'rgba(0,0,0,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: '100%', borderRadius: 3, background: `linear-gradient(to right, ${color}aa, ${color})` }} />
      </div>
      <span style={{ width: 28, textAlign: 'right', fontSize: 12, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 10, color: C.hint }}>{unit}</span>
    </div>
  );
}

function TrendBars({ trend }: { trend: number[] }) {
  const curHour = new Date().getHours();
  const labels = [];
  for (let i = 5; i >= 1; i--) labels.push(String(((curHour - i) + 24) % 24).padStart(2, '0'));
  labels.push(String(curHour).padStart(2, '0'));
  for (let i = 1; i <= 5; i++) labels.push(String((curHour + i) % 24).padStart(2, '0'));

  const getColor = (v: number, isPred: boolean) => {
    if (isPred) {
      if (v <= 0.3) return 'rgba(224,224,224,0.6)';
      if (v <= 0.5) return 'rgba(189,189,189,0.6)';
      if (v <= 0.7) return 'rgba(117,117,117,0.6)';
      return 'rgba(66,66,66,0.6)';
    }
    if (v <= 0.3) return 'rgba(212,86,122,0.8)';
    if (v <= 0.5) return 'rgba(255,193,7,0.8)';
    if (v <= 0.7) return 'rgba(255,87,34,0.8)';
    return 'rgba(156,39,176,0.8)';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 56, marginBottom: 6, gap: 6 }}>
        {trend.slice(0, 11).map((v, i) => (
          <div key={i} style={{
            width: 12, height: Math.max(5, v * 56), borderRadius: 2,
            backgroundColor: getColor(v, i > 5),
            border: i === 5 ? '1px solid #FBA7BC' : 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {labels.slice(0, 11).map((l, i) => (
          <div key={i} style={{ width: 12, textAlign: 'center', fontSize: 9, color: i === 5 ? C.rose : i > 5 ? 'rgba(93,115,137,0.4)' : 'rgba(93,115,137,0.6)', fontWeight: i === 5 ? 700 : 400 }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

interface CurrentWeatherData { temperature: string; weather: string; humidity: string; windSpeed: string; dailyHigh: string; dailyLow: string; }
interface ForecastDay { label: string; dateLabel: string; maxTemp: string; minTemp: string; weather: string; precipProb: string; }

const MOCK_CURRENT: CurrentWeatherData = { temperature: '24', weather: '晴時多雲', humidity: '68', windSpeed: '2.5', dailyHigh: '28', dailyLow: '19' };
const generateMockForecast = (): ForecastDay[] => {
  const DAY = ['日', '一', '二', '三', '四', '五', '六'];
  const now = new Date();
  return [1, 2, 3].map((i) => {
    const d = new Date(now); d.setDate(d.getDate() + i);
    return { label: `${d.getMonth() + 1}/${d.getDate()}`, dateLabel: `週${DAY[d.getDay()]}`, maxTemp: String(28 - i), minTemp: String(19 + i), weather: i === 2 ? '短暫陣雨' : '晴', precipProb: i === 2 ? '60' : '10' };
  });
};

async function fetchCurrentWeather(district: string): Promise<CurrentWeatherData> {
  const key = process.env.NEXT_PUBLIC_CWA_API_KEY;
  if (!key) return MOCK_CURRENT;
  try {
    const res = await fetch(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001?Authorization=${key}&CountyName=桃園市&format=JSON`);
    if (!res.ok) return MOCK_CURRENT;
    const json = await res.json();
    const stations: any[] = json?.records?.Station ?? [];
    if (!stations.length) return MOCK_CURRENT;
    const keyword = district.replace('區', '');
    const st = stations.find((s: any) => s.GeoInfo?.TownName?.includes(keyword)) ?? stations[0];
    const obs = st.WeatherElement ?? {};
    return {
      temperature: String(Math.round(parseFloat(obs.AirTemperature ?? MOCK_CURRENT.temperature))),
      weather: obs.Weather ?? MOCK_CURRENT.weather,
      humidity: obs.RelativeHumidity ?? MOCK_CURRENT.humidity,
      windSpeed: obs.WindSpeed ?? MOCK_CURRENT.windSpeed,
      dailyHigh: String(Math.round(parseFloat(obs.DailyExtreme?.DailyHigh?.TemperatureInfo?.AirTemperature ?? MOCK_CURRENT.dailyHigh))),
      dailyLow: String(Math.round(parseFloat(obs.DailyExtreme?.DailyLow?.TemperatureInfo?.AirTemperature ?? MOCK_CURRENT.dailyLow))),
    };
  } catch { return MOCK_CURRENT; }
}

async function fetchWeatherForecast(district: string): Promise<ForecastDay[]> {
  const key = process.env.NEXT_PUBLIC_CWA_API_KEY;
  if (!key) return generateMockForecast();
  const DAY = ['日', '一', '二', '三', '四', '五', '六'];
  try {
    const res = await fetch(`https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-005?Authorization=${key}&LocationsName=桃園市&LocationName=${district}&format=JSON`);
    if (!res.ok) return generateMockForecast();
    const json = await res.json();
    const loc = (json?.records?.Locations?.[0]?.Location ?? []).find((l: any) => l.LocationName === district) ?? (json?.records?.Locations?.[0]?.Location ?? [])[0];
    if (!loc) return generateMockForecast();
    const em: Record<string, any[]> = {};
    (loc.WeatherElement ?? []).forEach((el: any) => { em[el.ElementName] = el.Time ?? []; });
    const tempTimes = em['溫度'] ?? [], wxTimes = em['天氣現象'] ?? [], popTimes = em['3小時降雨機率'] ?? [];
    const dayMaxPop = (ds: string) => { const v = popTimes.filter((t: any) => (t.StartTime ?? '').startsWith(ds)).map((t: any) => parseInt(t.ElementValue?.[0]?.ProbabilityOfPrecipitation ?? '0', 10)).filter((v: number) => !isNaN(v)); return v.length ? Math.max(...v) : null; };
    const now = new Date();
    return [1, 2, 3].map((i) => {
      const d = new Date(now); d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const temps = tempTimes.filter((t: any) => (t.DataTime ?? '').startsWith(ds)).map((t: any) => parseFloat(t.ElementValue?.[0]?.Temperature ?? 'NaN')).filter((v: number) => !isNaN(v));
      const wx = wxTimes.filter((t: any) => (t.StartTime ?? '').startsWith(ds)).map((t: any) => t.ElementValue?.[0]?.Weather ?? '').filter(Boolean);
      return { label: `${d.getMonth() + 1}/${d.getDate()}`, dateLabel: `週${DAY[d.getDay()]}`, maxTemp: temps.length ? String(Math.max(...temps)) : String(28 - i), minTemp: temps.length ? String(Math.min(...temps)) : String(19 + i), precipProb: String(dayMaxPop(ds) ?? (i === 2 ? 60 : 10)), weather: wx[0] ?? '晴' };
    });
  } catch { return generateMockForecast(); }
}

export default function DashboardPage() {
  const { selectedScenario, setGridCells, setAlerts, setEvents, isLoading, setIsLoading } = useStore();
  const [locatedAqi, setLocatedAqi] = useState(65);
  const [locatedPm25, setLocatedPm25] = useState(18);
  const [locatedO3, setLocatedO3] = useState(42);
  const [currentDistrict, setCurrentDistrict] = useState('中壢區');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>('中壢區');
  const [currentWeather, setCurrentWeather] = useState<CurrentWeatherData>(MOCK_CURRENT);
  const [forecast, setForecast] = useState<ForecastDay[]>(generateMockForecast());

  const displayDistrict = selectedDistrict ?? currentDistrict;

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const nearest = findNearestDistrict(pos.coords.latitude, pos.coords.longitude);
      setCurrentDistrict(nearest); setSelectedDistrict(nearest);
    });
  }, []);

  useEffect(() => {
    fetchCurrentWeather(displayDistrict).then(setCurrentWeather);
    fetchWeatherForecast(displayDistrict).then(setForecast);
  }, [displayDistrict]);

  useEffect(() => {
    const s = DISTRICT_STATIC_AQ[displayDistrict];
    if (s) { setLocatedPm25(s.pm25); setLocatedO3(s.o3); setLocatedAqi(s.aqi); }
    fetchMoeStations().then((stations) => {
      const sitename = Object.entries(EPA_STATION_TO_DISTRICT).find(([, d]) => d === displayDistrict)?.[0];
      if (!sitename) return;
      const st = stations.find((s) => s.sitename === sitename);
      if (st) { setLocatedPm25(st.pm25); setLocatedO3(st.o3); setLocatedAqi(st.aqi || DISTRICT_STATIC_AQ[displayDistrict]?.aqi || 65); }
    }).catch(console.warn);
  }, [displayDistrict]);

  useEffect(() => {
    setIsLoading(true);
    setScenario(selectedScenario);
    Promise.all([getGrid({ pollutant: 'PM25' }), getAlerts(), getEvents()])
      .then(([grid, alertsData, eventsData]) => { setGridCells(grid); setAlerts(alertsData); setEvents(eventsData); })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedScenario]);

  const pm25 = locatedPm25, o3 = locatedO3, no2 = Math.round(pm25 * 0.3);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: `3px solid ${C.roseLt}`, borderTopColor: C.rose, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: C.rose, fontWeight: 600, fontSize: 15 }}>載入中...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fce8f0, #f0eafc, #e8f0fc, #e8f5ef)' }}>
      {/* District chips */}
      <div style={{ overflowX: 'auto', paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 8, paddingLeft: 48, paddingRight: 48, paddingBottom: 8, minWidth: 'max-content' }}>
          {DISTRICTS.map((d) => {
            const on = selectedDistrict === d;
            return (
              <button key={d} onClick={() => setSelectedDistrict(on ? null : d)} style={{
                padding: '6px 14px', borderRadius: 999, cursor: 'pointer',
                backgroundColor: on ? C.roseLt : C.glass2, border: `1px solid ${on ? C.roseBorder : C.glassBorder2}`,
                color: on ? C.rose : C.muted, fontWeight: on ? 700 : 500, fontSize: 12,
                transition: 'all 0.2s',
              }}>
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'flex', gap: 14, padding: '14px 48px 60px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* LEFT */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <GlassCard>
            <SecLabel title="空氣品質指數" />
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
              <AQIGauge aqi={locatedAqi} />
            </div>
            <p style={{ textAlign: 'center', fontSize: 10, color: C.hint, marginTop: 4 }}>數值範圍 0–200，越低越好</p>
          </GlassCard>
          <GlassCard>
            <SecLabel title="活動建議" />
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.roseLt, border: `1px solid ${C.roseBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.rose} strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              </div>
              <p style={{ flex: 1, fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{getActivityInfo(pm25)}</p>
            </div>
          </GlassCard>
        </div>

        {/* MIDDLE */}
        <div style={{ flex: 1, minWidth: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GlassCard>
            <SecLabel title="AI 趨勢分析" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12, backgroundColor: C.roseLt, border: `1px solid ${C.roseBorder}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: 'rgba(212,86,122,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.rose} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: C.rose }}>PM2.5 濃度預計下降</p>
                <p style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>未來 3 小時因海風輻合影響下降 12%</p>
              </div>
              <span style={{ padding: '3px 9px', borderRadius: 999, backgroundColor: 'rgba(212,86,122,0.14)', border: `1px solid ${C.roseBorder}`, fontSize: 12, fontWeight: 700, color: C.rose }}>−12%</span>
            </div>
          </GlassCard>

          <GlassCard>
            <SecLabel title="污染物詳情" />
            <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
              {[
                { label: 'PM2.5', value: pm25, unit: 'μg/m³', color: getPM25Color(pm25) },
                { label: 'O₃ 臭氧', value: o3, unit: 'ppb', color: getO3Color(o3) },
                { label: 'NO₂', value: no2, unit: 'ppb', color: getNO2Color(no2) },
              ].map(m => (
                <div key={m.label} style={{ flex: 1, padding: 13, borderRadius: 12, backgroundColor: C.glass2, border: `1px solid ${C.glassBorder2}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: C.hint, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'monospace', marginBottom: 4 }}>{m.label}</span>
                  <span style={{ fontSize: 24, fontWeight: 700, color: m.color, lineHeight: 1.1 }}>{m.value}</span>
                  <span style={{ fontSize: 10, color: C.hint, marginTop: 3 }}>{m.unit}</span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginBottom: 14 }} />
            <PollBar name="細懸浮微粒" nameEn="PM2.5" value={pm25} max={75} color={getPM25Color(pm25)} unit="μg/m³" />
            <PollBar name="臭氧" nameEn="O₃" value={o3} max={100} color={getO3Color(o3)} unit="ppb" />
            <PollBar name="二氧化氮" nameEn="NO₂" value={no2} max={100} color={getNO2Color(no2)} unit="ppb" />
            <div style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)', margin: '14px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>PM2.5 趨勢</span>
              <span style={{ fontSize: 10, color: C.hint }}>過去 5h ／ NOW ／ 預測 5h</span>
            </div>
            <TrendBars trend={[0.45, 0.5, 0.55, 0.6, 0.58, 0.62, 0.48, 0.52, 0.65, 0.42, 0.38]} />
          </GlassCard>
        </div>

        {/* RIGHT */}
        <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <GlassCard>
            <SecLabel title="當前天氣" />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: C.glass2, border: `1px solid ${C.glassBorder2}`, marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 44, fontWeight: 700, color: C.text, lineHeight: 1 }}>{currentWeather.temperature}°</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{currentWeather.weather}</p>
                <p style={{ fontSize: 10, color: C.hint, marginTop: 3 }}>{currentWeather.dailyHigh}° / {currentWeather.dailyLow}°</p>
              </div>
              <div style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.glass, border: `1px solid ${C.glassInner}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={C.rose} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[{ label: '濕度', value: `${currentWeather.humidity}%`, color: C.sky }, { label: '風速', value: `${currentWeather.windSpeed}m/s`, color: C.mint }].map(s => (
                <div key={s.label} style={{ flex: 1, padding: 10, borderRadius: 12, backgroundColor: C.glass2, border: `1px solid ${C.glassBorder2}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: C.hint, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'monospace' }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SecLabel title="未來三日預報" />
            <div style={{ display: 'flex', gap: 8 }}>
              {forecast.map((day, i) => {
                const hi = i === 1;
                return (
                  <div key={i} style={{ flex: 1, padding: 12, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, backgroundColor: hi ? C.roseLt : C.glass2, border: `1px solid ${hi ? C.roseBorder : C.glassBorder2}` }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{day.dateLabel}</span>
                    <span style={{ fontSize: 10, color: C.hint, marginBottom: 4 }}>{day.label}</span>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={Number(day.precipProb) >= 50 ? C.sky : C.rose} strokeWidth="1.5" style={{ margin: '8px 0' }}>
                      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    </svg>
                    <span style={{ fontSize: 10, color: C.muted, textAlign: 'center' }}>{day.weather}</span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.text, marginTop: 3 }}>{day.maxTemp}° / {day.minTemp}°</span>
                    <span style={{ fontSize: 10, color: C.hint, marginTop: 2 }}>{day.precipProb}%</span>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
