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

/* ── Dashboard 完全相同的 fetch ──────────────────────── */
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

/* ── AQI 六段色帶 ─────────────────────────────────────── */
function AqiColorBar({ activeLevelId }: { activeLevelId: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 20 }}>
      {AQI_LEVELS.map((l) => {
        const active = l.id === activeLevelId;
        return (
          <div
            key={l.id}
            title={l.label}
            style={{
              height: 20,
              flex: active ? 2 : 1,
              borderRadius: 6,
              backgroundColor: l.hex,
              transform: active ? 'scaleY(1)' : 'scaleY(0.5)',
              transformOrigin: 'bottom',
              transition: 'transform 0.3s ease, flex 0.3s ease, box-shadow 0.3s ease',
              boxShadow: active ? `0 2px 8px ${l.hex}88` : 'none',
              outline: active ? `2px solid ${l.hex}` : 'none',
              outlineOffset: 2,
            }}
          />
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
      {items.map((line, i) => (
        <p key={i} style={{ fontSize: 12, lineHeight: 1.75, color: C.text, margin: 0 }}>{line}</p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function HealthPage() {
  const { user } = useAuth();

  /* ── 完全跟 dashboard 一樣的 state ─────────────────── */
  const [district, setDistrict] = useState('中壢區');
  const [allStations, setAllStations] = useState<MoeStationData[]>([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 820);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* Geolocation — 完全跟 dashboard 一樣 */
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

  /* fetchMoeStations — 完全跟 dashboard 一樣 */
  useEffect(() => {
    fetchMoeStations().then(setAllStations).catch(console.error);
  }, []);

  /* ── AQI 計算 — 完全跟 dashboard 一樣 ──────────────── */
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
  const level      = useMemo(() => getAqiLevel(aqi), [aqi]);
  const levelText  = OFFICIAL_LEVEL_TEXT.find((t) => t.levelId === level?.id);
  const isSensitive = (user?.sensitivity ?? '一般民眾') === '敏感族群';

  /* ── 右欄內容 ────────────────────────────────────────── */
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

      {/* 地區名 + AQI 圓環 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <AqiGauge aqi={aqi} animationKey={`${district}-${aqi}`} />
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
          <span style={{ fontSize: 11, color: C.hint }}>
            {live ? '即時資料' : '靜態資料'}・點選地圖切換區域
          </span>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(30,58,95,0.08)' }} />

      {/* 對健康影響與活動建議標題 + 色帶 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: C.hint }}>
            對健康影響與活動建議
          </span>
        </div>

        {level && <AqiColorBar activeLevelId={level.id} />}

        {/* 色塊標籤 */}
        <div style={{ display: 'flex', gap: 4 }}>
          {AQI_LEVELS.map((l) => (
            <div key={l.id} style={{
              flex: l.id === level?.id ? 2 : 1,
              textAlign: 'center',
              fontSize: 9,
              fontWeight: l.id === level?.id ? 800 : 500,
              color: l.id === level?.id ? C.text : C.hint,
              transition: 'all 0.3s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}>
              {l.colorName}
            </div>
          ))}
        </div>

        {/* 人體健康影響 */}
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          backgroundColor: level ? `${level.hex}18` : 'rgba(30,58,95,0.04)',
          border: `1px solid ${level ? level.hex + '44' : C.glassBorder}`,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.hint, margin: '0 0 4px', letterSpacing: 0.5 }}>
            人體健康影響
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.75, color: C.text, margin: 0 }}>
            {levelText?.healthImpact ?? '—'}
          </p>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: 'rgba(30,58,95,0.08)' }} />

      {/* 兩欄活動建議 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.5 }}>活動建議</span>
        <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
          <AdviceColumn
            title="一般民眾活動建議"
            items={levelText?.generalAdvice ?? ['—']}
            highlight={!isSensitive}
            levelHex={level?.hex ?? C.primary}
            showBadge={false}
          />
          <AdviceColumn
            title="敏感性族群活動建議"
            items={levelText?.sensitiveAdvice ?? ['—']}
            highlight={isSensitive}
            levelHex={level?.hex ?? C.primary}
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

  /* ── 左欄:地圖 ───────────────────────────────────────── */
  const renderLeft = () => (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flexShrink: 0,
      flexGrow: 0,
      width: 'min(44%, 520px)',
      minWidth: 280,
    }}>
      <div style={{
        width: '100%',
        height: 'min(60vh, 540px)',
        overflow: 'hidden',
      }}>
        <TaoyuanSVGMap
          selectedDistrict={district}
          onSelectDistrict={setDistrict}
        />
      </div>
    </div>
  );

  /* ── 完整版面 ──────────────────────────────────────────── */
  return (
    <div style={{
      padding: isMobile ? '20px 16px 80px' : '50px 40px 50px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
    }}>
      {/* 主區塊:左地圖 | 右 AQI — flex-wrap 讓空間不足時自動換行 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-start',
      }}>
        {renderLeft()}
        {renderRight()}
      </div>

      {/* 免責聲明 */}
      <div style={{ maxWidth: isMobile ? '100%' : 760 }}>
        <Disclaimer variant="full" />
      </div>
    </div>
  );
}
