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
      {items.map((line, i) => (
        <p key={i} style={{ fontSize: 12, lineHeight: 1.75, color: C.text, margin: 0 }}>{line}</p>
      ))}
    </div>
  );
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
            <span style={{ fontSize: 11, color: C.hint }}>
              {live ? '即時資料' : '靜態資料'}・點選地圖切換區域
            </span>
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
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: C.hint }}>
            對健康影響與活動建議
          </span>
          <AqiLevelPicker
            activeLevelId={activeLevelId}
            selectedLevelId={displayLevelId}
            onSelect={(id) => setPreviewLevelId(id === activeLevelId ? null : id)}
          />

          {/* 預覽提示 */}
          {previewLevelId !== null && previewLevelId !== activeLevelId && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px', borderRadius: 8,
              backgroundColor: `${displayLevel?.hex}18`,
              border: `1px dashed ${displayLevel?.hex}66`,
            }}>
              <span style={{ fontSize: 11, color: C.muted }}>
                預覽：<strong style={{ color: displayLevel?.hex }}>{displayLevel?.label}</strong>（AQI {displayLevel?.min}–{displayLevel?.max}）
              </span>
              <button
                onClick={() => setPreviewLevelId(null)}
                style={{
                  fontSize: 10, color: C.hint, background: 'none', border: 'none',
                  cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                }}
              >
                回到當前
              </button>
            </div>
          )}

          {/* 人體健康影響 */}
          <div style={{
            padding: '12px 14px', borderRadius: 12,
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
    }}>
      <div style={{
        width: '100%',
        height: isMobile ? 'min(55vw, 320px)' : 'min(60vh, 540px)',
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

          {/* 免責聲明 */}
          <div style={{ maxWidth: isMobile ? '100%' : 760 }}>
            <Disclaimer variant="full" />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
