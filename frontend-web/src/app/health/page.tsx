'use client';

import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { MoeStationData } from '@shared/api/moe';
import {
  DISTRICT_STATIC_AQ,
  EPA_STATION_TO_DISTRICT,
  findNearestDistrict,
} from '@shared/constants/districts';
import { useAuth } from '@/lib/auth-context';
import { getAqiLevel } from '@/lib/health/aqiUtils';
import { AqiGauge } from '@/components/shared/AqiGauge';
import { Disclaimer } from '@/components/health/Disclaimer';
import { OFFICIAL_LEVEL_TEXT, OFFICIAL_SOURCE } from '@shared/constants/officialText';
import { AQI_LEVELS } from '@shared/constants/airHealth';
import { API_BASE } from '@/lib/apiBase';
import TaoyuanSVGMap from '@/components/map/TaoyuanSVGMap';
import { AuthGuard } from '@/components/auth/AuthGuard';

/* ── fetch ───────────────────────────────────────────── */
const fetchMoeStations = (): Promise<MoeStationData[]> =>
  fetch(`${API_BASE}/moe`)
    .then((r) => r.json())
    .then((res) => res.data);

/* ── 設計 token ───────────────────────────────────────── */
const C = {
  primary:       '#4895EC',
  primaryAlpha:  'rgba(72,149,236,0.12)',
  primaryBorder: 'rgba(72,149,236,0.30)',
  glass:         'rgba(255,255,255,0.52)',
  glassBorder:   'rgba(255,255,255,0.72)',
  glassShadow:   '0 4px 16px rgba(30,58,95,0.10)',
  text:          '#0F1D3A',
  muted:         '#4A6080',
  hint:          '#7A9AC0',
};

/* ── 區域擴充污染物靜態資料（與 dashboard 相同） ─────── */
const DISTRICT_EXTENDED: Record<string, { no2: number; so2: number; co: number; pm10: number }> = {
  桃園區: { no2: 15, so2: 2.5, co: 0.45, pm10: 45 },
  中壢區: { no2: 15, so2: 1.3, co: 0.41, pm10: 44 },
  八德區: { no2: 12, so2: 2.1, co: 0.38, pm10: 38 },
  龜山區: { no2: 18, so2: 3.2, co: 0.55, pm10: 52 },
  蘆竹區: { no2: 11, so2: 2.0, co: 0.35, pm10: 32 },
  大園區: { no2: 10, so2: 2.8, co: 0.30, pm10: 30 },
  大溪區: { no2: 9, so2: 1.8, co: 0.28, pm10: 28 },
  平鎮區: { no2: 13, so2: 2.2, co: 0.40, pm10: 36 },
  楊梅區: { no2: 12, so2: 2.0, co: 0.36, pm10: 34 },
  龍潭區: { no2: 10, so2: 1.9, co: 0.36, pm10: 33 },
  觀音區: { no2: 16, so2: 3.5, co: 0.48, pm10: 50 },
  新屋區: { no2: 14, so2: 3.0, co: 0.46, pm10: 48 },
  復興區: { no2: 5, so2: 1.2, co: 0.20, pm10: 20 },
};

/* ── AQI 色票選擇器 ───────────────────────────────────── */
function AqiLevelPicker({
  activeLevelId,
  selectedLevelId,
  onSelect,
}: {
  activeLevelId: number;
  selectedLevelId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {AQI_LEVELS.map((l) => {
        const isActive = l.id === activeLevelId;
        const isSelected = l.id === selectedLevelId;
        return (
          <button
            key={l.id}
            onClick={() => onSelect(l.id)}
            title={`${l.label}（AQI ${l.min}–${l.max}）`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 99,
              border: isSelected
                ? `2px solid ${l.hex}`
                : '2px solid transparent',
              backgroundColor: isSelected ? `${l.hex}22` : `${l.hex}11`,
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.2s ease',
              boxShadow: isSelected ? `0 0 0 3px ${l.hex}30` : 'none',
              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            {/* 色點 */}
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: l.hex,
              flexShrink: 0,
              boxShadow: isActive ? `0 0 0 2px ${l.hex}66` : 'none',
            }} />
            <span style={{
              fontSize: 11,
              fontWeight: isSelected ? 800 : 600,
              color: isSelected ? l.hex : C.hint,
              whiteSpace: 'nowrap',
            }}>
              {l.colorName}
            </span>
            {isActive && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#fff',
                backgroundColor: l.hex,
                borderRadius: 99,
                padding: '1px 5px',
                lineHeight: 1.4,
              }}>
                NOW
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ── 活動建議欄 ───────────────────────────────────────── */
function AdviceColumn({
  title,
  items,
  highlight,
  levelHex,
  showBadge,
}: {
  title: string;
  items: string[];
  highlight: boolean;
  levelHex: string;
  showBadge: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '14px 16px',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.65)',
        border: `1.5px solid ${highlight ? levelHex + '88' : C.glassBorder}`,
        boxShadow: highlight ? `0 0 0 3px ${levelHex}22` : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{title}</span>
        {highlight && showBadge && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: 0.3,
            backgroundColor: C.primaryAlpha, padding: '2px 8px', borderRadius: 99,
          }}>
            依您的設定
          </span>
        )}
      </div>
      {items.map((line, i) => {
        // 官方資料格式：「1.內容」或「1 內容」，剝掉開頭編號自行渲染
        const text = line.replace(/^\d+[.\s]\s*/, '');
        const hasNum = /^\d+[.\s]/.test(line);
        return (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {hasNum && (
              <span style={{
                flexShrink: 0,
                width: 18, height: 18,
                borderRadius: '50%',
                backgroundColor: `${levelHex}22`,
                border: `1.2px solid ${levelHex}66`,
                color: levelHex,
                fontSize: 10,
                fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                {i + 1}
              </span>
            )}
            <p style={{ fontSize: 12, lineHeight: 1.75, color: C.text, margin: 0 }}>{text}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ── 污染物單項卡片 ───────────────────────────────────── */
interface PollutantCardProps {
  name: string;
  value: number;
  unit: string;
  status: string;
  statusColor: string;
}

function PollutantCard({ name, value, unit, status, statusColor }: PollutantCardProps) {
  return (
    <div style={{
      flex: '1 1 140px',
      minWidth: 120,
      padding: '14px 16px',
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.70)',
      border: `1px solid ${C.glassBorder}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.3 }}>
          {name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: C.text, lineHeight: 1 }}>
          {value}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>
          {unit}
        </span>
      </div>
      <div style={{
        display: 'inline-block',
        alignSelf: 'flex-start',
        padding: '3px 10px',
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 700,
        backgroundColor: `${statusColor}22`,
        border: `1px solid ${statusColor}66`,
        color: statusColor,
      }}>
        {status}
      </div>
    </div>
  );
}

/* ── 污染物狀態判斷（參考環境部濃度對照表） ─────────── */
function getPollutantStatus(pollutant: string, value: number): { status: string; color: string } {
  // 參考 https://airtw.moenv.gov.tw/CHT/Information/Standard/AirQualityIndicatorNew.aspx#tg4
  // 簡化為三級：良好/普通/超標
  const thresholds: Record<string, { good: number; moderate: number }> = {
    'PM2.5': { good: 12.4, moderate: 30.4 },     // μg/m³
    'PM10':  { good: 30, moderate: 75 },          // μg/m³
    'O₃':    { good: 0.054, moderate: 0.07 },     // ppm (8h)
    'NO₂':   { good: 21, moderate: 100 },         // ppb (1h)
    'SO₂':   { good: 8, moderate: 65 },           // ppb (1h)
    'CO':    { good: 4.4, moderate: 9.4 },        // ppm (8h)
  };
  const t = thresholds[pollutant];
  if (!t) return { status: '—', color: C.hint };
  if (value <= t.good) return { status: '良好', color: '#4caf50' };
  if (value <= t.moderate) return { status: '普通', color: '#edbb05' };
  return { status: '注意', color: '#ff9800' };
}

/* ═══════════════════════════════════════════════════════ */
export default function HealthPage() {
  const { user } = useAuth();

  const [district, setDistrict] = useState('中壢區');
  const [allStations, setAllStations] = useState<MoeStationData[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  /* 使用者目前點選預覽的 level id（預設跟隨目前 AQI） */
  const [previewLevelId, setPreviewLevelId] = useState<number | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 820);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* Geolocation */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearestDistrict(pos.coords.latitude, pos.coords.longitude);
        setDistrict(nearest);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, []);

  useEffect(() => {
    fetchMoeStations().then(setAllStations).catch(console.error);
  }, []);

  /* ── AQI 計算 ───────────────────────────────────────── */
  const remoteMetrics = useMemo(() => {
    if (!allStations.length) return null;
    const sitename = Object.entries(EPA_STATION_TO_DISTRICT)
      .find(([, d]) => d === district)?.[0];
    if (!sitename) return null;
    const station = allStations.find((s) => s.sitename === sitename);
    if (!station) return null;
    const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ['中壢區'];
    return { district, aqi: station.aqi || base.aqi };
  }, [district, allStations]);

  const base = DISTRICT_STATIC_AQ[district] ?? DISTRICT_STATIC_AQ['中壢區'];
  const live = remoteMetrics?.district === district ? remoteMetrics : null;
  const aqi  = live?.aqi ?? base.aqi;

  /* ── 健康資訊 ───────────────────────────────────────── */
  const level = useMemo(() => getAqiLevel(aqi), [aqi]);

  /* 切換區域時重置 preview 為當前 level */
  useEffect(() => {
    setPreviewLevelId(null);
  }, [district]);

  const activeLevelId   = level?.id ?? 1;
  const displayLevelId  = previewLevelId ?? activeLevelId;
  const displayLevel    = AQI_LEVELS.find((l) => l.id === displayLevelId);
  const displayLevelText = OFFICIAL_LEVEL_TEXT.find((t) => t.levelId === displayLevelId);

  const isSensitive = (user?.sensitivity ?? '一般民眾') === '敏感族群';

  /* ── 污染物數值（優先 live，fallback 靜態） ─────────── */
  const liveStation = useMemo(() => {
    if (!allStations.length) return null;
    const sitename = Object.entries(EPA_STATION_TO_DISTRICT)
      .find(([, d]) => d === district)?.[0];
    return allStations.find((s) => s.sitename === sitename) ?? null;
  }, [district, allStations]);

  const extStatic = DISTRICT_EXTENDED[district] ?? DISTRICT_EXTENDED['中壢區'];
  const pollutants = {
    pm25: liveStation?.pm25 || (DISTRICT_STATIC_AQ[district]?.pm25 ?? 18),
    pm10: liveStation?.pm10 || extStatic.pm10,
    o3:   liveStation?.o3   || (DISTRICT_STATIC_AQ[district]?.o3 ?? 42),
    no2:  liveStation?.no2  || extStatic.no2,
    so2:  liveStation?.so2  || extStatic.so2,
    co:   liveStation?.co   || extStatic.co,
  };

  /* ── AQI 資訊框 ──────────────────────────────────────── */
  const renderRight = () => (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20,
      backgroundColor: C.glass,
      border: `1px solid ${C.glassBorder}`,
      borderRadius: 20,
      boxShadow: C.glassShadow,
      padding: '24px 20px',
      flex: 1,
      minWidth: 280,
    }}>

      {/* 小標題 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 16, marginBottom: '8px', }}>
        <div style={{
          width: 3, height: 14, flexShrink: 0, borderRadius: 2,
          backgroundColor: C.primary,
          boxShadow: `0 0 8px ${C.primaryBorder}`,
        }} />
        <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>AQI 空氣指標</span>
      </div>

      {/* ── 第一排：圓環 | 地區資訊 + 健康影響區塊 ── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 16 : 20,
        alignItems: isMobile ? 'stretch' : 'flex-start',
      }}>
        {/* 左：圓環 + 地區名（固定橫排，圓環左、文字右） */}
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          flexShrink: 0,
        }}>
          <AqiGauge
            key={`${district}-${aqi}`}
            aqi={aqi}
            animationKey={`${district}-${aqi}`}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <MapPin size={16} color={C.primary} strokeWidth={2.5} />
              <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{district}</span>
            </div>
            {level && (
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                backgroundColor: level.hex, color: level.darkText ? C.text : '#fff',
                alignSelf: 'flex-start',
              }}>
                {level.label}
              </span>
            )}
          </div>
        </div>

        {/* 分隔線：大螢幕直線、小螢幕橫線 */}
        <div style={{
          width:           isMobile ? '100%' : 1,
          height:          isMobile ? 1 : 'auto',
          alignSelf:       'stretch',
          backgroundColor: 'rgba(30,58,95,0.10)',
          flexShrink:      0,
        }} />

        {/* 右：色票 + 健康影響（大螢幕佔剩餘空間） */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <AqiLevelPicker
            activeLevelId={activeLevelId}
            selectedLevelId={displayLevelId}
            onSelect={(id) => setPreviewLevelId(id === activeLevelId ? null : id)}
          />

          {/* 等級資訊列（永遠顯示） */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 10px', borderRadius: 8, minHeight: 32, marginTop: '8px',
            backgroundColor: `${displayLevel?.hex}18`,
            border: `1px ${previewLevelId !== null && previewLevelId !== activeLevelId ? 'dashed' : 'solid'} ${displayLevel?.hex}66`,
            transition: 'all 0.3s ease',
          }}>
            <span style={{ fontSize: 11, color: C.muted }}>
              <strong style={{ color: displayLevel?.hex }}>{displayLevel?.label}</strong>
              　AQI {displayLevel?.min}–{displayLevel?.max}
            </span>
            {previewLevelId !== null && previewLevelId !== activeLevelId ? (
              <button
                onClick={() => setPreviewLevelId(null)}
                style={{
                  fontSize: 10, color: C.hint, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                  flexShrink: 0,
                }}
              >
                回到當前
              </button>
            ) : (
              <span style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0, visibility: 'hidden' }}>
                回到當前
              </span>
            )}
          </div>

          {/* 人體健康影響 */}
          <div style={{
            padding: '12px 14px', borderRadius: 12, marginTop: '4px',
            backgroundColor: displayLevel ? `${displayLevel.hex}18` : 'rgba(30,58,95,0.04)',
            border: `1px solid ${displayLevel ? displayLevel.hex + '44' : C.glassBorder}`,
            transition: 'all 0.3s ease',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.hint, margin: '0 0 4px', letterSpacing: 0.5 }}>
              人體健康影響
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.75, color: C.text, margin: 0 }}>
              {displayLevelText?.healthImpact ?? '—'}
            </p>
          </div>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(30,58,95,0.08)' }} />

      {/* 兩欄活動建議 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.5 }}>活動建議</span>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <AdviceColumn
            title="一般民眾活動建議"
            items={displayLevelText?.generalAdvice ?? ['—']}
            highlight={!isSensitive}
            levelHex={displayLevel?.hex ?? C.primary}
            showBadge={false}
          />
          <AdviceColumn
            title="敏感性族群活動建議"
            items={displayLevelText?.sensitiveAdvice ?? ['—']}
            highlight={isSensitive}
            levelHex={displayLevel?.hex ?? C.primary}
            showBadge={true}
          />
        </div>
        <span style={{ fontSize: 11, color: C.hint }}>
          資料來源：
          <a
            href={OFFICIAL_SOURCE.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.primary, fontWeight: 600, textDecoration: 'none' }}
          >
            {OFFICIAL_SOURCE.name}
          </a>
        </span>
      </div>
    </div>
  );

  /* ── 地圖欄 ───────────────────────────────────────────── */
  const renderLeft = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0,
      flexGrow: 0,
      width: isMobile ? '100%' : 'min(44%, 520px)',
      minWidth: isMobile ? 'unset' : 280,
      position: 'relative',
    }}>
      <div style={{
        width: '100%',
        height: isMobile ? 'min(55vw, 320px)' : 'min(60vh, 540px)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <TaoyuanSVGMap
          selectedDistrict={district}
          onSelectDistrict={setDistrict}
        />
        {/* Map pill overlay */}
        <button
          type="button"
          style={{
            position: 'absolute',
            left: isMobile ? 12 : 20,
            bottom: isMobile ? 12 : 16,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            border: `1px solid ${C.primary}`,
            borderRadius: 999,
            padding: isMobile ? '8px 14px' : '10px 18px',
            background: '#EBF3FE',
            color: C.primary,
            fontSize: isMobile ? 13 : 15,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            cursor: 'default',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          點選查看區域詳情
          <MapPin size={15} strokeWidth={2.5} />
          {district}
        </button>
      </div>
    </div>
  );

  /* ── 完整版面 ──────────────────────────────────────────── */
  return (
    <AuthGuard>
      <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)' }}>
        <div style={{
          padding: isMobile ? '20px 16px 80px' : '50px 40px 50px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* 主區塊：手機直排（地圖在上）、寬螢幕橫排 */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            flexWrap: isMobile ? 'nowrap' : 'wrap',
            gap: 24,
            alignItems: 'flex-start',
          }}>
            {renderLeft()}
            {renderRight()}
          </div>

          {/* 污染物模塊 */}
          <div style={{
            backgroundColor: C.glass,
            border: `1px solid ${C.glassBorder}`,
            borderRadius: 20,
            boxShadow: C.glassShadow,
            padding: '20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}>
            {/* 小標題 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 16 }}>
              <div style={{
                width: 3, height: 14, flexShrink: 0, borderRadius: 2,
                backgroundColor: C.primary,
                boxShadow: `0 0 8px ${C.primaryBorder}`,
              }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>污染物即時濃度</span>
            </div>

            {/* 六項污染物卡片 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {([
                { name: 'PM2.5', value: pollutants.pm25, unit: 'μg/m³', key: 'PM2.5' },
                { name: 'PM10',  value: pollutants.pm10, unit: 'μg/m³', key: 'PM10' },
                { name: 'O₃',   value: pollutants.o3,   unit: 'ppm',   key: 'O₃' },
                { name: 'NO₂',  value: pollutants.no2,  unit: 'ppb',   key: 'NO₂' },
                { name: 'SO₂',  value: pollutants.so2,  unit: 'ppb',   key: 'SO₂' },
                { name: 'CO',   value: pollutants.co,   unit: 'ppm',   key: 'CO' },
              ] as const).map(({ name, value, unit, key }) => {
                const { status, color } = getPollutantStatus(key, value);
                return (
                  <PollutantCard
                    key={name}
                    name={name}
                    value={value}
                    unit={unit}
                    status={status}
                    statusColor={color}
                  />
                );
              })}
            </div>
          </div>

          {/* 免責聲明 */}
          <div style={{ maxWidth: isMobile ? '100%' : 760 }}>
            <Disclaimer variant="full" />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
