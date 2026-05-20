'use client';

import React, { useState } from 'react';
import { palette } from '@shared/constants/theme';

const allEventData = [
  { id: 1, category: '工業聚集區', title: '觀音中心排放', description: '在工業區範圍內檢測到局部 SO2 尖峰。', severity: '中等風險', status: '固定站', trend: '穩定中', exposure: '~1.2k 人', duration: '45分鐘 持續', location: '觀音區', healthIndex: '敏感警告', severityColor: palette.accentYellow, icon: '🏭', isActive: true, isResolved: false },
  { id: 2, category: '大氣流入', title: '重度 PM2.5 流入', description: '跨境污染物影響北部住宅區域。', severity: '高風險', status: 'AI 識別', trend: '上升中', exposure: '~3.5k 人', duration: '2小時15分鐘 活躍', location: '蘆竹區', confidence: '98.4%', severityColor: palette.accentRed, icon: '⚠️', isActive: true, isResolved: false },
  { id: 3, category: '交通排放', title: '中壢交流道壅塞', description: '尖峰時段車流導致 NOx 濃度升高。', severity: '低風險', status: '固定站', trend: '下降中', exposure: '~800 人', duration: '1小時30分鐘 持續', location: '中壢區', healthIndex: '良好', severityColor: palette.accentGreen, icon: '🚗', isActive: true, isResolved: false },
  { id: 4, category: '工業聚集區', title: '大園工業區異常', description: '檢測到 VOCs 濃度異常升高。', severity: '中等風險', status: 'AI 識別', trend: '已穩定', exposure: '~2.1k 人', duration: '已解決', location: '大園區', confidence: '92.1%', severityColor: palette.primaryMid, icon: '🏭', isActive: false, isResolved: true },
  { id: 5, category: '區域性事件', title: '桃園市區空品惡化', description: '多個測站同時檢測到 PM2.5 升高。', severity: '高風險', status: '固定站', trend: '持平', exposure: '~5.8k 人', duration: '3小時 持續', location: '桃園區', healthIndex: '不健康', severityColor: palette.accentRed, icon: '🔴', isActive: true, isResolved: false },
];

const filterOptions = {
  events: ['活躍事件', '歷史事件', '已解決事件'],
  districts: ['所有區域', '蘆竹區', '觀音區', '中壢區', '桃園區', '大園區'],
  severity: ['嚴重度', '高風險', '中等風險', '低風險'],
};

export default function EventsPage() {
  const [selectedFilter, setSelectedFilter] = useState('活躍事件');
  const [selectedDistrict, setSelectedDistrict] = useState('所有區域');
  const [selectedSeverity, setSelectedSeverity] = useState('嚴重度');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const filtered = allEventData.filter((e) => {
    if (selectedFilter === '活躍事件' && !e.isActive) return false;
    if (selectedFilter === '已解決事件' && !e.isResolved) return false;
    if (selectedFilter === '歷史事件' && e.isActive) return false;
    if (selectedDistrict !== '所有區域' && e.location !== selectedDistrict) return false;
    if (selectedSeverity !== '嚴重度' && e.severity !== selectedSeverity) return false;
    return true;
  });

  const FilterBtn = ({ id, value, options, onSelect }: { id: string; value: string; options: string[]; onSelect: (v: string) => void }) => (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpenDropdown(openDropdown === id ? null : id)} style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 20, cursor: 'pointer',
        backgroundColor: openDropdown === id ? palette.primaryDeep : 'rgba(255,255,255,0.75)',
        border: `1px solid ${palette.borderSoft}`, color: openDropdown === id ? '#fff' : palette.primaryDeep, fontWeight: 600, fontSize: 14,
      }}>
        {value}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {openDropdown === id && (
        <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 100, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: `1px solid ${palette.borderSoft}`, minWidth: 160 }}>
          {options.map((opt) => (
            <button key={opt} onClick={() => { onSelect(opt); setOpenDropdown(null); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '16px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, color: palette.textMain, fontWeight: 500, borderBottom: `1px solid rgba(95,83,104,0.15)` }}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, padding: '20px 20px 0', flexWrap: 'wrap' }}>
        <FilterBtn id="events" value={selectedFilter} options={filterOptions.events} onSelect={setSelectedFilter} />
        <FilterBtn id="districts" value={selectedDistrict} options={filterOptions.districts} onSelect={setSelectedDistrict} />
        <FilterBtn id="severity" value={selectedSeverity} options={filterOptions.severity} onSelect={setSelectedSeverity} />
      </div>

      {/* Cards grid */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, padding: '24px 20px', justifyContent: 'flex-start' }}>
        {filtered.map((event) => (
          <div key={event.id} style={{ backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: 32, overflow: 'hidden', boxShadow: '0 8px 24px rgba(94,42,66,0.05)', width: 'clamp(300px, 31%, 400px)', flexShrink: 0 }}>
            {/* Map thumbnail */}
            <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#FFF1FF', position: 'relative', overflow: 'hidden' }}>
              <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=121.15,24.95,121.35,25.05&layer=mapnik`}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title={`Map of ${event.location}`}
              />
              <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 8 }}>
                <span style={{ padding: '6px 12px', borderRadius: 20, backgroundColor: event.severityColor, fontSize: 11, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase' }}>{event.severity}</span>
                <span style={{ padding: '6px 12px', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: 'bold', color: palette.textMain, textTransform: 'uppercase' }}>{event.status}</span>
              </div>
              <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 'bold', color: palette.textMain, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>影響類別</p>
                <p style={{ fontSize: 24, fontWeight: 'bold', color: palette.textMain, lineHeight: 1.2, textShadow: '0 1px 2px rgba(255,255,255,0.8)' }}>{event.category}</p>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 20, fontWeight: 'bold', color: palette.textMain, marginBottom: 8 }}>{event.title}</p>
                  <p style={{ fontSize: 14, color: palette.textSecondary, lineHeight: 1.5 }}>{event.description}</p>
                </div>
                <div style={{ width: 48, height: 48, backgroundColor: palette.primarySoft, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {event.icon}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                {[
                  { label: '持續時間', value: event.duration },
                  { label: '位置', value: event.location },
                  event.trend && { label: '趨勢', value: event.trend },
                  event.exposure && { label: '暴露人口', value: event.exposure },
                ].filter(Boolean).map((item: any) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 40, height: 40, backgroundColor: 'rgba(255,51,255,0.1)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={palette.textSecondary} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div>
                      <p style={{ fontSize: 12, color: palette.textSecondary, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{item.label}</p>
                      <p style={{ fontSize: 16, color: palette.textMain, fontWeight: 600 }}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, color: palette.textSecondary, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {(event as any).confidence ? 'AI 信心分數' : '健康指數'}
                  </p>
                  <p style={{ fontSize: 18, fontWeight: 'bold', color: (event as any).confidence ? palette.primaryDeep : palette.accentRed }}>
                    {(event as any).confidence || (event as any).healthIndex}
                  </p>
                </div>
                <button style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 24, border: 'none', cursor: 'pointer', backgroundColor: (event as any).confidence ? palette.primaryDeep : 'rgba(0,0,0,0.05)', color: (event as any).confidence ? '#fff' : palette.textMain, fontSize: 14, fontWeight: 600 }}>
                  {(event as any).confidence ? 'AI 證據' : '完整分析'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
