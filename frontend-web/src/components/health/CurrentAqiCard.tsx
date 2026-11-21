'use client';

import type { MoeStationData } from '@shared/api/moe';
import type { MoeStation } from '@/lib/health/districtStations';
import type { District } from '@/lib/health/districtStations';
import { getAqiLevel } from '@/lib/health/aqiUtils';
import { C, card } from './tokens';
import { StationPicker } from './StationPicker';
import { OfficialAdviceColumns } from './OfficialAdviceColumns';
import { SourceFooter } from './SourceFooter';

interface CurrentAqiCardProps {
  district: string;
  onDistrictChange: (d: District) => void;
  refStation: MoeStation;
  showStoreHint: boolean;
  station?: MoeStationData;
  isFallback: boolean;
  loading: boolean;
  sensitivity: string;
  refetch: () => void;
}

const POLLUTANTS: { key: keyof MoeStationData; label: string; unit: string }[] = [
  { key: 'pm25', label: 'PM2.5', unit: 'μg/m³' },
  { key: 'pm10', label: 'PM10', unit: 'μg/m³' },
  { key: 'o3', label: 'O₃', unit: 'ppb' },
  { key: 'no2', label: 'NO₂', unit: 'ppb' },
  { key: 'so2', label: 'SO₂', unit: 'ppb' },
  { key: 'co', label: 'CO', unit: 'ppm' },
];

export function CurrentAqiCard(props: CurrentAqiCardProps) {
  const { district, onDistrictChange, refStation, showStoreHint, station, isFallback, loading, sensitivity, refetch } = props;
  const hasData = !!station && !isFallback && !loading;
  const level = hasData && station ? getAqiLevel(station.aqi) : null;

  const renderConcentrations = () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {POLLUTANTS.map(({ key, label, unit }) => {
        const v = station ? (station[key] as number) : 0;
        const display = hasData ? (Number.isFinite(v) ? v : '—') : '—';
        return (
          <div
            key={key}
            style={{
              padding: '10px 12px', borderRadius: 12,
              backgroundColor: 'rgba(255,255,255,0.55)',
              border: `1px solid ${C.glassBorder}`,
              display: 'flex', flexDirection: 'column', gap: 2,
            }}
          >
            <span style={{ fontSize: 11, color: C.hint }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              {display}
              <span style={{ fontSize: 10, fontWeight: 500, color: C.hint, marginLeft: 4 }}>{hasData ? unit : ''}</span>
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <StationPicker
        district={district}
        onDistrictChange={onDistrictChange}
        refStation={refStation}
        showStoreHint={showStoreHint}
      />

      {loading ? (
        <div style={{ height: 120, borderRadius: 14, backgroundColor: 'rgba(30,58,95,0.06)' }} />
      ) : hasData && station ? (
        <>
          {/* AQI 大數字 + 級別(文字標籤必備,不只靠顏色)+ 資料時間 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, color: C.hint }}>AQI</span>
              <span style={{ fontSize: 44, fontWeight: 800, color: level?.hex ?? C.text, lineHeight: 1 }}>
                {station.aqi}
              </span>
            </div>
            {level && (
              <span
                style={{
                  fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 99,
                  backgroundColor: level.hex, color: level.darkText ? C.text : '#fff',
                }}
              >
                {level.label}
              </span>
            )}
            <span style={{ fontSize: 11, color: C.hint, marginLeft: 'auto' }}>
              資料時間:{station.datacreationdate ?? '—'}
            </span>
          </div>

          {renderConcentrations()}

          <OfficialAdviceColumns level={level} sensitive={sensitivity === '敏感族群'} />

          <SourceFooter
            source="環境部空氣品質監測網(測站即時資料)"
            dataTime={station.datacreationdate}
          />
        </>
      ) : (
        // /moe 失敗或 isFallback:顯示「資料暫時無法取得」+ 重試,不使用靜態假資料(R4)
        <div
          style={{
            padding: '20px 16px', borderRadius: 14,
            backgroundColor: 'rgba(30,58,95,0.04)', border: `1px solid ${C.glassBorder}`,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>資料暫時無法取得</span>
          <button
            onClick={refetch}
            style={{
              padding: '7px 16px', borderRadius: 99, cursor: 'pointer',
              backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
              fontSize: 12, fontWeight: 700, color: C.primary,
            }}
          >
            重試
          </button>
          {/* 無 AQI 級別時,官方活動建議仍提供外連結 */}
          <OfficialAdviceColumns level={null} sensitive={sensitivity === '敏感族群'} />
        </div>
      )}
    </div>
  );
}
