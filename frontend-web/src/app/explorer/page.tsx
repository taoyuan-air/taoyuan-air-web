'use client';

import React, { useState } from 'react';
import { palette } from '@shared/constants/theme';

const allMonitoringData = [
  { id: 1, district: '中壢區', station: 'Station TY-09', time: '14:02 PM', passed: true, pollutant: 'PM2.5', value: 12, unit: 'μg/m³', source: 'MOE', version: 'v2.1', color: '#E76595', timeCategory: '近24小時', region: '中壢區' },
  { id: 2, district: '蘆竹工業區', station: 'Grid Alpha-4', time: '13:45 PM', passed: false, pollutant: 'PM2.5', value: 48, unit: 'μg/m³', source: '微感測', version: 'v2.0', color: '#FFA868', timeCategory: '近24小時', region: '桃園區' },
  { id: 3, district: '觀音海岸', station: 'Sensor TY-42', time: '13:20 PM', passed: true, pollutant: 'PM2.5', value: 8, unit: 'μg/m³', source: '光達', version: 'v2.1', color: '#E76595', timeCategory: '近24小時', region: '觀音區' },
  { id: 4, district: '大園工業區', station: 'Station TY-15', time: '12:30 PM', passed: true, pollutant: 'O3', value: 35, unit: 'ppb', source: 'MOE', version: 'v2.1', color: '#E76595', timeCategory: '近24小時', region: '大園區' },
  { id: 5, district: '桃園市區', station: 'Micro-Sensor B12', time: '11:15 AM', passed: false, pollutant: 'NOX', value: 85, unit: 'ppb', source: '微感測', version: 'v1.8', color: '#FF6B6B', timeCategory: '近24小時', region: '桃園區' },
  { id: 6, district: '中壢商業區', station: 'LUV-Station C3', time: '10:45 AM', passed: true, pollutant: 'VOCs', value: 22, unit: 'ppb', source: 'LUV', version: 'v3.0', color: '#E76595', timeCategory: '近24小時', region: '中壢區' },
  { id: 7, district: '觀音工業區', station: 'Grid Beta-7', time: '昨日 23:30', passed: false, pollutant: 'PM2.5', value: 52, unit: 'μg/m³', source: '微感測', version: 'v2.0', color: '#FFA868', timeCategory: '近3天', region: '觀音區' },
  { id: 8, district: '大園住宅區', station: 'Station TY-22', time: '昨日 22:15', passed: true, pollutant: 'O3', value: 28, unit: 'ppb', source: 'MOE', version: 'v2.1', color: '#E76595', timeCategory: '近3天', region: '大園區' },
  { id: 9, district: '桃園機場周邊', station: 'LIDAR-Point A1', time: '昨日 20:00', passed: true, pollutant: 'NOX', value: 42, unit: 'ppb', source: '光達', version: 'v2.3', color: '#E76595', timeCategory: '近3天', region: '大園區' },
  { id: 10, district: '中壢工業區', station: 'Micro-Array D5', time: '昨日 18:45', passed: false, pollutant: 'VOCs', value: 78, unit: 'ppb', source: '微感測', version: 'v1.9', color: '#FF6B6B', timeCategory: '近3天', region: '中壢區' },
  { id: 11, district: '桃園都會區', station: 'LUV-Hub M1', time: '3天前 16:30', passed: true, pollutant: 'PM2.5', value: 18, unit: 'μg/m³', source: 'LUV', version: 'v3.0', color: '#E76595', timeCategory: '近7天', region: '桃園區' },
  { id: 12, district: '觀音沿海', station: 'Station TY-35', time: '4天前 14:20', passed: true, pollutant: 'O3', value: 31, unit: 'ppb', source: 'MOE', version: 'v2.1', color: '#E76595', timeCategory: '近7天', region: '觀音區' },
  { id: 13, district: '大園農業區', station: 'LIDAR-Grid F8', time: '5天前 12:10', passed: false, pollutant: 'NOX', value: 95, unit: 'ppb', source: '光達', version: 'v2.3', color: '#FF6B6B', timeCategory: '近7天', region: '大園區' },
  { id: 14, district: '中壢市中心', station: 'Micro-Net G2', time: '6天前 09:45', passed: true, pollutant: 'VOCs', value: 25, unit: 'ppb', source: '微感測', version: 'v2.0', color: '#E76595', timeCategory: '近7天', region: '中壢區' },
  { id: 15, district: '桃園高鐵區', station: 'LUV-Station H4', time: '7天前 15:30', passed: true, pollutant: 'PM2.5', value: 15, unit: 'μg/m³', source: 'LUV', version: 'v3.0', color: '#E76595', timeCategory: '近7天', region: '桃園區' },
];

type OpenFilter = 'time' | 'pollutant' | 'region' | 'source' | null;

export default function ExplorerPage() {
  const [searchText, setSearchText] = useState('');
  const [selectedTime, setSelectedTime] = useState('近24小時');
  const [selectedPollutant, setSelectedPollutant] = useState('PM2.5');
  const [selectedRegion, setSelectedRegion] = useState('全市');
  const [selectedSources, setSelectedSources] = useState<string[]>(['MOE']);
  const [openFilter, setOpenFilter] = useState<OpenFilter>(null);

  const toggleSource = (s: string) =>
    setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const filtered = allMonitoringData.filter(item => {
    if (searchText && !item.district.toLowerCase().includes(searchText.toLowerCase()) && !item.station.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (selectedTime !== '近24小時' && item.timeCategory !== selectedTime) return false;
    if (selectedPollutant !== 'PM2.5' && item.pollutant !== selectedPollutant) return false;
    if (selectedRegion !== '全市' && item.region !== selectedRegion) return false;
    if (selectedSources.length > 0 && !selectedSources.includes(item.source)) return false;
    return true;
  });

  const filterBtnStyle = (active: boolean) => ({
    display: 'flex' as const, alignItems: 'center' as const, gap: 6,
    padding: '10px 16px', borderRadius: 20, border: 'none', cursor: 'pointer' as const,
    fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap' as const,
    backgroundColor: active ? '#E76595' : 'rgba(255,255,255,0.7)',
    color: active ? '#fff' : '#E76595',
  });

  const dropdownStyle = {
    marginTop: 4, backgroundColor: 'rgba(255,255,255,0.97)', borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: `1px solid ${palette.borderSoft}`, overflow: 'hidden' as const,
    zIndex: 10, position: 'relative' as const,
  };

  const dropdownItemStyle = {
    display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
    padding: '12px 16px', cursor: 'pointer' as const, borderBottom: '1px solid rgba(0,0,0,0.05)',
    fontSize: 14, color: '#333', background: 'transparent', border: 'none', width: '100%', textAlign: 'left' as const,
  };

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(180deg, ${palette.bgBase}, #FFEAF0)`, paddingBottom: 100 }}>
      {/* Search Bar */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 25, padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', gap: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="搜尋區域或感測器 ID" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 16, color: '#333', outline: 'none' }}
          />
        </div>
      </div>

      {/* Filter Buttons */}
      <div style={{ display: 'flex', gap: 12, padding: '0 20px 20px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {([
          { id: 'time' as OpenFilter, label: selectedTime },
          { id: 'pollutant' as OpenFilter, label: selectedPollutant },
          { id: 'region' as OpenFilter, label: selectedRegion },
          { id: 'source' as OpenFilter, label: '資料來源' },
        ] as const).map(({ id, label }) => (
          <button key={id} onClick={() => setOpenFilter(openFilter === id ? null : id)} style={filterBtnStyle(openFilter === id)}>
            {label}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        ))}
      </div>

      {/* Filter Dropdowns */}
      {openFilter === 'time' && (
        <div style={{ ...dropdownStyle, margin: '0 20px 16px' }}>
          {['近24小時', '近3天', '近7天'].map(opt => (
            <button key={opt} style={dropdownItemStyle} onClick={() => { setSelectedTime(opt); setOpenFilter(null); }}>{opt}</button>
          ))}
        </div>
      )}
      {openFilter === 'pollutant' && (
        <div style={{ ...dropdownStyle, margin: '0 20px 16px' }}>
          {['PM2.5', 'O3', 'NOX', 'VOCs'].map(opt => (
            <button key={opt} style={dropdownItemStyle} onClick={() => { setSelectedPollutant(opt); setOpenFilter(null); }}>{opt}</button>
          ))}
        </div>
      )}
      {openFilter === 'region' && (
        <div style={{ ...dropdownStyle, margin: '0 20px 16px' }}>
          {['全市', '桃園區', '中壢區', '大園區', '觀音區'].map(opt => (
            <button key={opt} style={dropdownItemStyle} onClick={() => { setSelectedRegion(opt); setOpenFilter(null); }}>{opt}</button>
          ))}
        </div>
      )}
      {openFilter === 'source' && (
        <div style={{ ...dropdownStyle, margin: '0 20px 16px' }}>
          {['MOE', '微感測', '光達', 'LUV'].map(opt => (
            <button key={opt} style={dropdownItemStyle} onClick={() => toggleSource(opt)}>
              <span>{opt}</span>
              {selectedSources.includes(opt) && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E76595" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Feed header */}
      <div style={{ padding: '0 20px 16px' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#E76595', letterSpacing: 2 }}>監測動態</p>
      </div>

      {/* Monitoring Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px' }}>
        {filtered.map((item) => (
          <div key={item.id} style={{ backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 4 }}>{item.district}</p>
                <p style={{ fontSize: 14, color: '#666' }}>{item.station} · {item.time}</p>
              </div>
              <span style={{ padding: '6px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600, backgroundColor: item.passed ? '#F8D0DA' : '#FFD4B3', color: item.passed ? '#E76595' : '#D2691E', flexShrink: 0 }}>
                {item.passed ? '通過' : '異常'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>{item.pollutant}</p>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>來源: {item.source}</p>
                <p style={{ fontSize: 12, color: '#666' }}>版本: {item.version}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 32, fontWeight: 'bold', color: '#333' }}>{item.value}</span>
                <p style={{ fontSize: 14, color: '#666', marginTop: -4 }}>{item.unit}</p>
              </div>
            </div>
            <div style={{ height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(item.value * 1.5, 80)}%`, background: `linear-gradient(to right, ${item.color}, ${item.color}80)` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Health Advisory */}
      <div style={{ margin: '24px 20px 0', backgroundColor: '#FBA7BC', borderRadius: 16, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', letterSpacing: 2, marginBottom: 12 }}>健康建議</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>✨</span>
          <p style={{ flex: 1, fontSize: 14, color: '#fff', lineHeight: 1.5 }}>桃園空氣品質保持穩定。今日適合戶外活動。</p>
        </div>
      </div>
    </div>
  );
}
