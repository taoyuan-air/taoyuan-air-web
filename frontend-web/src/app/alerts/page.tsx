'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '@shared/store';
import { getAlerts, setScenario } from '@shared/api/index';
import { palette } from '@shared/constants/theme';
import { PentagonRadar } from '@/components/charts/PentagonRadar';

const cardStyle = {
  backgroundColor: 'rgba(255,255,255,0.4)',
  borderRadius: 24,
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow: '0 4px 12px rgba(94,42,66,0.05)',
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div onClick={() => onChange(!value)} style={{
      width: 48, height: 28, borderRadius: 14, cursor: 'pointer', position: 'relative', flexShrink: 0,
      backgroundColor: value ? '#E76595' : '#E0E0E0', transition: 'background-color 0.2s',
    }}>
      <div style={{
        position: 'absolute', top: 3, left: value ? 23 : 3, width: 22, height: 22,
        borderRadius: 11, backgroundColor: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

function DonutChart() {
  return (
    <div style={{
      width: 80, height: 80, borderRadius: 40,
      border: '10px solid rgba(255,255,255,0.3)',
      borderTopColor: '#E76595', borderRightColor: '#E76595', borderBottomColor: '#7F5A6A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 10, fontWeight: 'bold', color: '#2D3129' }}>70%</span>
    </div>
  );
}

export default function AlertsPage() {
  const { setAlerts, selectedScenario, setIsLoading } = useStore();
  const [activeTab, setActiveTab] = useState<'HEALTH' | 'GOV'>('HEALTH');
  const [healthGuardEnabled, setHealthGuardEnabled] = useState(true);
  const [thresholds, setThresholds] = useState({ asthma: 35, activity: 80, urgency: 20 });

  useEffect(() => {
    setIsLoading(true);
    setScenario(selectedScenario);
    getAlerts()
      .then(setAlerts)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [selectedScenario]);

  const getThresholdLabel = (type: string, value: number) => {
    if (type === 'asthma') return `${value} µg/m³`;
    if (type === 'activity') return value > 70 ? '劇烈運動' : value > 40 ? '中等運動' : '輕度運動';
    if (type === 'urgency') return value < 30 ? '僅重要' : value < 70 ? '一般' : '全部';
    return `${value}`;
  };

  const sliders = [
    { key: 'asthma' as const, label: '氣喘門檻', icon: '🩺', left: '嚴格', right: '寬鬆' },
    { key: 'activity' as const, label: '活動強度', icon: '💪', left: '輕度', right: '劇烈' },
    { key: 'urgency' as const, label: '通知緊急度', icon: '⚡', left: '全部', right: '緊急' },
  ];

  const strategies = [
    { icon: '🏭', iconBg: 'rgba(231,101,149,0.1)', title: '工業管制', badge: '高優先', badgeBg: 'rgba(231,101,149,0.2)', badgeColor: '#7F5A6A', desc: '建議觀音工業區明日活動削減 10%，因預測風向停滯將持續至明日。' },
    { icon: '🚗', iconBg: 'rgba(59,130,246,0.1)', title: '交通分流', badge: '例行', badgeBg: 'rgba(59,130,246,0.2)', badgeColor: '#1D4ED8', desc: '優化中壢區晚間號誌時序，預防晚間尖峰時段 NO2 累積。' },
    { icon: '📢', iconBg: 'rgba(249,115,22,0.1)', title: '公眾健康通知', badge: '建議', badgeBg: 'rgba(249,115,22,0.2)', badgeColor: '#C2410C', desc: '針對中壢區 08:00-09:00 時段發布「低暴露」窗口警示給年長居民。' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}>
      {/* Tab selector */}
      <div style={{ padding: '16px 24px' }}>
        <div style={{ display: 'flex', padding: 4, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.4)' }}>
          {(['HEALTH', 'GOV'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', borderRadius: 12,
              fontWeight: 'bold', fontSize: 12, textTransform: 'uppercase', transition: 'all 0.2s',
              backgroundColor: activeTab === tab ? '#fff' : 'transparent',
              color: activeTab === tab ? '#2D3129' : 'rgba(85,90,79,0.6)',
              boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            }}>
              {tab === 'HEALTH' ? '個人健康' : '治理支援'}
            </button>
          ))}
        </div>
      </div>

      {/* Health Guard Card */}
      {activeTab === 'HEALTH' && (
        <div style={{ margin: '0 24px', ...cardStyle, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
            <div>
              <p style={{ fontSize: 18, fontWeight: 'bold', color: '#2D3129', marginBottom: 4 }}>主動健康守護</p>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1.5 }}>自訂敏感度</p>
            </div>
            <Toggle value={healthGuardEnabled} onChange={setHealthGuardEnabled} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {sliders.map(({ key, label, icon, left, right }) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: '#2D3129' }}>{label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: '#E76595' }}>
                    {getThresholdLabel(key, thresholds[key])}
                  </span>
                </div>
                <input
                  type="range" min={0} max={100} value={thresholds[key]}
                  onChange={(e) => setThresholds(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#E76595', cursor: 'pointer', height: 6 }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase' }}>{left}</span>
                  <span style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase' }}>{right}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Governance Support */}
      {activeTab === 'GOV' && (
        <>
          {/* Analysis Workbench */}
          <div style={{ margin: '0 24px', ...cardStyle, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <p style={{ fontSize: 18, fontWeight: 'bold', color: '#2D3129', marginBottom: 4 }}>分析工作台</p>
                <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1.5 }}>區域影響矩陣</p>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(231,101,149,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                📊
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1 }}>異常偵測</p>
                <PentagonRadar data={[0.8, 0.6, 0.7, 0.9, 0.5]} labels={['化學', '粉塵', '生物', '氣體', '氣候']} size={120} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1 }}>來源歸因</p>
                <DonutChart />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[{ color: '#E76595', label: '工業' }, { color: '#7F5A6A', label: '交通' }].map(({ color, label }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                      <span style={{ fontSize: 8, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Policy Simulation */}
          <div style={{ margin: '16px 24px 0', ...cardStyle, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <p style={{ fontSize: 16, fontWeight: 'bold', color: '#2D3129' }}>政策模擬</p>
              <p style={{ fontSize: 12, fontWeight: 'bold', color: '#E76595' }}>-25% AQI 目標</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1 }}>工業產出削減</span>
              <span style={{ fontSize: 18, fontWeight: 'bold', color: '#2D3129' }}>15%</span>
            </div>
            <div>
              <p style={{ fontSize: 10, fontWeight: 'bold', color: '#E76595', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>預估結果</p>
              <p style={{ fontSize: 12, color: '#7F5A6A', lineHeight: 1.4 }}>大園區 48 小時內預計改善 12%</p>
            </div>
          </div>

          {/* AI Strategy Feed */}
          <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 2, paddingLeft: 4 }}>AI 策略推薦</p>
            {strategies.map(({ icon, iconBg, title, badge, badgeBg, badgeColor, desc }) => (
              <div key={title} style={{ display: 'flex', ...cardStyle, padding: 16, gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 'bold', color: '#2D3129' }}>{title}</span>
                    <span style={{ fontSize: 9, fontWeight: 'bold', color: badgeColor, textTransform: 'uppercase', backgroundColor: badgeBg, padding: '2px 8px', borderRadius: 10 }}>{badge}</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#7F5A6A', lineHeight: 1.4 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* AI Analysis Cards (always visible) */}
      <div style={{ display: 'flex', padding: '24px 24px 0', gap: 16 }}>
        <div style={{ flex: 1, minHeight: 200, ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 'bold', color: '#2D3129', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>異常偵測</p>
            <p style={{ fontSize: 10, color: '#7F5A6A' }}>穩定指數: 92%</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <PentagonRadar data={[0.9, 0.7, 0.8, 0.6, 0.75]} labels={['化學', '粉塵', '生物', '氣體', '氣候']} size={100} />
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 200, ...cardStyle, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 'bold', color: '#2D3129', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>來源歸因</p>
            <p style={{ fontSize: 10, color: '#7F5A6A' }}>影響鄰近度</p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <DonutChart />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[{ color: '#E76595', label: '工廠' }, { color: '#7F5A6A', label: '交通' }].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                <span style={{ fontSize: 8, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Critical Thresholds */}
      <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 2, paddingLeft: 4 }}>重要門檻</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, ...cardStyle, padding: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            🩺
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 'bold', color: '#2D3129' }}>PM2.5 注意</span>
              <span style={{ fontSize: 10, fontWeight: 'bold', color: '#C2410C', textTransform: 'uppercase', backgroundColor: 'rgba(249,115,22,0.2)', padding: '2px 8px', borderRadius: 12 }}>啟用</span>
            </div>
            <p style={{ fontSize: 12, color: '#7F5A6A', lineHeight: 1.4 }}>中壢區濃度超過 35µg/m³ 時通知</p>
          </div>
        </div>
      </div>

      {/* AI Health Tip */}
      <div style={{ margin: '24px 24px 0', display: 'flex', gap: 16, backgroundColor: 'rgba(248,208,218,0.1)', border: '2px solid rgba(248,208,218,0.2)', borderRadius: 24, padding: 20, alignItems: 'flex-start' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.1)', border: '1px solid rgba(248,208,218,0.1)' }}>
          💡
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 'bold', color: '#7F5A6A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>AI 健康建議</p>
          <p style={{ fontSize: 14, color: '#2D3129', lineHeight: 1.4, fontWeight: '500' }}>觀音區晨間空氣品質連續 4 天達到最佳狀態。適合晨跑。</p>
        </div>
      </div>
    </div>
  );
}
