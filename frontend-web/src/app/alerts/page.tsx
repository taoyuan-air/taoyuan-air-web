'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity, BarChart2, Car, Factory,
  Lightbulb, Megaphone, ShieldAlert, Stethoscope, Zap,
} from 'lucide-react';
import { useStore } from '@shared/store';
import { getAlerts, setScenario } from '@shared/api/index';
import { PentagonRadar } from '@/components/charts/PentagonRadar';
import { AuthGuard } from '@/components/auth/AuthGuard';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:      '#D4567A',
  primaryAlpha: 'rgba(212,86,122,0.12)',
  primaryBorder:'rgba(212,86,122,0.30)',
  blue:         '#3B82F6',
  blueAlpha:    'rgba(59,130,246,0.12)',
  blueBorder:   'rgba(59,130,246,0.35)',
  orange:       '#F97316',
  orangeAlpha:  'rgba(249,115,22,0.12)',
  orangeBorder: 'rgba(249,115,22,0.25)',
  glass:        'rgba(255,255,255,0.52)',
  glassBorder:  'rgba(255,255,255,0.72)',
  glassShadow:  '0 4px 16px rgba(180,140,160,0.10)',
  text:         '#1a1220',
  muted:        '#7a6880',
  hint:         '#b0a0b8',
};

const card: React.CSSProperties = {
  backgroundColor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 20,
  boxShadow: C.glassShadow,
};

/* ─── Toggle ─────────────────────────────────────────────────── */
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="switch" aria-checked={value} tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => e.key === ' ' && onChange(!value)}
      style={{
        width: 44, height: 26, borderRadius: 13, cursor: 'pointer',
        position: 'relative', flexShrink: 0, outline: 'none',
        backgroundColor: value ? C.primary : 'rgba(180,140,160,0.25)',
        transition: 'background-color 0.2s',
        boxShadow: value ? `0 0 0 3px ${C.primaryAlpha}` : 'none',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 20, height: 20, borderRadius: 10,
        backgroundColor: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
      }} />
    </div>
  );
}

/* ─── Custom Slider ──────────────────────────────────────────── */
interface SliderProps {
  min: number; max: number; value: number;
  onChange: (v: number) => void;
  color?: string;
}
function Slider({ min, max, value, onChange, color = C.primary }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center' }}>
      {/* track bg */}
      <div style={{
        position: 'absolute', width: '100%', height: 5, borderRadius: 3,
        backgroundColor: 'rgba(180,140,160,0.15)',
      }} />
      {/* filled track */}
      <div style={{
        position: 'absolute', height: 5, borderRadius: 3,
        backgroundColor: color, width: `${pct}%`,
        transition: 'width 0.05s',
      }} />
      {/* thumb visual */}
      <div style={{
        position: 'absolute', width: 17, height: 17, borderRadius: '50%',
        backgroundColor: '#fff', border: `2.5px solid ${color}`,
        boxShadow: `0 2px 8px rgba(180,140,160,0.25)`,
        left: `calc(${pct}% - 8.5px)`, pointerEvents: 'none', zIndex: 1,
        transition: 'left 0.05s',
      }} />
      {/* native input — transparent, sits on top for interaction */}
      <input
        type="range" min={min} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          position: 'absolute', width: '100%', opacity: 0,
          cursor: 'pointer', height: 22, margin: 0, zIndex: 2,
        }}
      />
    </div>
  );
}

/* ─── Section label ──────────────────────────────────────────── */
function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingLeft: 2 }}>
      <div style={{
        width: 3, height: 14, borderRadius: 2,
        backgroundColor: C.primary,
        boxShadow: `0 0 6px ${C.primaryAlpha}`,
      }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>{title}</span>
    </div>
  );
}

/* ─── Donut chart ────────────────────────────────────────────── */
function DonutChart() {
  return (
    <div style={{
      width: 88, height: 88, borderRadius: '50%',
      background: `conic-gradient(${C.primary} 0% 70%, rgba(127,90,106,0.5) 70% 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 4px 16px rgba(212,86,122,0.15)`,
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        backgroundColor: 'rgba(255,248,250,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>70%</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export default function AlertsPage() {
  const { setAlerts, selectedScenario, setIsLoading } = useStore();
  const [activeTab, setActiveTab] = useState<'HEALTH' | 'GOV'>('HEALTH');
  const [healthGuardEnabled, setHealthGuardEnabled] = useState(true);
  const [thresholds, setThresholds] = useState({ asthma: 35, activity: 80, urgency: 20 });
  const [govThresholds, setGovThresholds] = useState({
    industrial: 10,
    traffic: '輕度' as '輕度' | '中管制' | '強管制' | '極強管制',
    alert: 30,
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setIsLoading(true);
    setScenario(selectedScenario);
    getAlerts().then(setAlerts).catch(console.error).finally(() => setIsLoading(false));
  }, [selectedScenario, setAlerts, setIsLoading]);

  const getThresholdLabel = (type: string, value: number) => {
    if (type === 'asthma') return `${value} µg/m³`;
    if (type === 'activity') return value > 70 ? '劇烈運動' : value > 40 ? '中等運動' : '輕度運動';
    if (type === 'urgency') return value < 30 ? '僅重要' : value < 70 ? '一般' : '全部';
    return `${value}`;
  };

  const healthSliders = [
    { key: 'asthma'  as const, label: '氣喘門檻',   Icon: Stethoscope, left: '嚴格', right: '寬鬆', color: C.primary },
    { key: 'activity'as const, label: '活動強度',   Icon: Activity,    left: '輕度', right: '劇烈', color: C.primary },
    { key: 'urgency' as const, label: '通知緊急度', Icon: Zap,         left: '全部', right: '緊急', color: C.primary },
  ];

  const strategies = [
    {
      Icon: Factory, bg: C.primaryAlpha, color: C.primary,
      title: '工業管制', badge: '高優先', badgeBg: C.primaryAlpha, badgeColor: C.primary,
      desc: `建議觀音工業區明日活動削減 ${govThresholds.industrial}%，因預測風向停滯將持續至明日。`,
    },
    {
      Icon: Car, bg: C.blueAlpha, color: C.blue,
      title: '交通分流', badge: '例行', badgeBg: C.blueAlpha, badgeColor: C.blue,
      desc: '優化中壢區晚間號誌時序，預防晚間尖峰時段 NO₂ 累積。',
    },
    {
      Icon: Megaphone, bg: C.orangeAlpha, color: C.orange,
      title: '公眾健康通知', badge: '建議', badgeBg: C.orangeAlpha, badgeColor: C.orange,
      desc: `門檻 AQI > ${govThresholds.alert} 時，針對中壢區發布「低暴露」窗口警示給年長居民。`,
    },
  ];

  /* ── shared section column gap ── */
  const colGap = 16;

  return (
    <AuthGuard>
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}>
      <div style={{ padding: isMobile ? '20px 16px 28px' : '28px 40px 32px' }}>

        {/* ── Tab bar ──────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
          {(['HEALTH', 'GOV'] as const).map((tab) => {
            const active = activeTab === tab;
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
                backgroundColor: active ? C.primaryAlpha : C.glass,
                border: `1px solid ${active ? C.primaryBorder : C.glassBorder}`,
                boxShadow: C.glassShadow,
                fontWeight: 700, fontSize: 13, letterSpacing: 0.2,
                color: active ? C.primary : C.hint,
                transition: 'all 0.18s',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  backgroundColor: active ? C.primary : 'rgba(180,140,160,0.35)',
                  transition: 'background-color 0.18s',
                }} />
                {tab === 'HEALTH' ? '個人健康' : '治理支援'}
              </button>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════════════
            個人健康
        ════════════════════════════════════════════════════ */}
        {activeTab === 'HEALTH' && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: 'flex-start' }}>

            {/* Left — 健康守護設定 */}
            <div style={{ flex: isMobile ? 'none' : 1, width: isMobile ? '100%' : undefined }}>
              <SectionLabel title="健康守護設定" />
              <div style={{ ...card, padding: isMobile ? 20 : 28 }}>
                {/* card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
                  <div>
                    <p style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 5 }}>主動健康守護</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.hint, letterSpacing: 1.2 }}>自訂敏感度</p>
                  </div>
                  <Toggle value={healthGuardEnabled} onChange={setHealthGuardEnabled} />
                </div>

                {/* sliders */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                  {healthSliders.map(({ key, label, Icon, left, right, color }) => (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Icon size={16} color={color} strokeWidth={2.2} />
                          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{label}</span>
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, color,
                          backgroundColor: C.primaryAlpha, padding: '3px 10px', borderRadius: 99,
                        }}>
                          {getThresholdLabel(key, thresholds[key])}
                        </span>
                      </div>
                      <Slider
                        min={0} max={100} value={thresholds[key]} color={color}
                        onChange={(v) => setThresholds(prev => ({ ...prev, [key]: v }))}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.hint, letterSpacing: 0.5 }}>{left}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.hint, letterSpacing: 0.5 }}>{right}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — 分析結果 */}
            <div style={{ flex: isMobile ? 'none' : 1.7, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 0 }}>
              <SectionLabel title="分析結果" />

              {/* AI analysis cards */}
              <div style={{ display: 'flex', gap: colGap, marginBottom: 20 }}>
                {/* 異常偵測 */}
                <div style={{ flex: 1, ...card, padding: 18, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.8, marginBottom: 3 }}>異常偵測</p>
                    <p style={{ fontSize: 11, color: C.muted }}>穩定指數: 92%</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <PentagonRadar data={[0.9, 0.7, 0.8, 0.6, 0.75]} labels={['化學', '粉塵', '生物', '氣體', '氣候']} size={100} />
                  </div>
                </div>
                {/* 來源歸因 */}
                <div style={{ flex: 1, ...card, padding: 18, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.8, marginBottom: 3 }}>來源歸因</p>
                    <p style={{ fontSize: 11, color: C.muted }}>影響鄰近度</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <DonutChart />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                    {[{ color: C.primary, label: '工廠' }, { color: '#7F5A6A', label: '交通' }].map(({ color, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 重要門檻 */}
              <div style={{ marginBottom: 12 }}>
                <SectionLabel title="重要門檻" />
                <div style={{ ...card, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    backgroundColor: C.orangeAlpha, border: `1px solid ${C.orangeBorder}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <ShieldAlert size={18} color={C.orange} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>PM<sub className="text-xs">2.5</sub> 注意</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: C.orange, letterSpacing: 0.5,
                        backgroundColor: C.orangeAlpha, padding: '3px 10px', borderRadius: 99,
                      }}>啟用</span>
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>中壢區濃度超過 35 µg/m³ 時通知</p>
                  </div>
                </div>
              </div>

              {/* AI 健康建議 */}
              <div style={{ ...card, padding: 18, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Lightbulb size={18} color={C.primary} strokeWidth={2} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 4 }}>AI 健康建議</p>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.55 }}>
                    觀音區晨間空氣品質連續 4 天達到最佳狀態。適合晨跑。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════
            治理支援
        ════════════════════════════════════════════════════ */}
        {activeTab === 'GOV' && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 24, alignItems: 'flex-start' }}>

            {/* Left — 治理參數調整 */}
            <div style={{ flex: isMobile ? 'none' : 1, width: isMobile ? '100%' : undefined }}>
              <SectionLabel title="治理參數調整" />
              <div style={{ ...card, padding: isMobile ? 20 : 28 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
                  <div>
                    <p style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 5 }}>政策模擬參數</p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: C.hint, letterSpacing: 1.2 }}>調整治理強度</p>
                  </div>
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    backgroundColor: C.primaryAlpha, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <BarChart2 size={18} color={C.primary} strokeWidth={2} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
                  {/* 工業產出削減 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Factory size={16} color={C.primary} strokeWidth={2} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>工業產出汙染物削減</span>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: C.primary,
                        backgroundColor: C.primaryAlpha, padding: '3px 10px', borderRadius: 99,
                      }}>削減 {govThresholds.industrial}%</span>
                    </div>
                    <Slider min={0} max={50} value={govThresholds.industrial} color={C.primary}
                      onChange={(v) => setGovThresholds(p => ({ ...p, industrial: v }))} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.hint }}>0%</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.hint }}>50%</span>
                    </div>
                  </div>

                  {/* 交通管制強度 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Car size={16} color={C.blue} strokeWidth={2} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>交通管制強度</span>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: C.blue,
                        backgroundColor: C.blueAlpha, padding: '3px 10px', borderRadius: 99,
                      }}>{govThresholds.traffic}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: 8 }}>
                      {(['輕度', '中管制', '強管制', '極強管制'] as const).map((opt) => {
                        const active = govThresholds.traffic === opt;
                        return (
                          <button key={opt} onClick={() => setGovThresholds(p => ({ ...p, traffic: opt }))} style={{
                            flex: isMobile ? '1 1 calc(50% - 4px)' : 1, padding: '8px 4px', borderRadius: 10, cursor: 'pointer',
                            fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                            backgroundColor: active ? C.blueAlpha : C.glass,
                            border: `1px solid ${active ? C.blueBorder : C.glassBorder}`,
                            color: active ? C.blue : C.muted,
                          }}>{opt}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 公眾警報門檻 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Megaphone size={16} color={C.orange} strokeWidth={2} />
                        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>公眾警報門檻</span>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: C.orange,
                        backgroundColor: C.orangeAlpha, padding: '3px 10px', borderRadius: 99,
                      }}>AQI &gt; {govThresholds.alert}</span>
                    </div>
                    <Slider min={0} max={200} value={govThresholds.alert} color={C.orange}
                      onChange={(v) => setGovThresholds(p => ({ ...p, alert: v }))} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.hint }}>AQI 0</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.hint }}>AQI 200</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — 治理分析結果 */}
            <div style={{ flex: isMobile ? 'none' : 1.7, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 0 }}>
              <SectionLabel title="治理分析結果" />

              {/* AI analysis cards */}
              <div style={{ display: 'flex', gap: colGap, marginBottom: 20 }}>
                <div style={{ flex: 1, ...card, padding: 18, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.8, marginBottom: 3 }}>異常偵測</p>
                    <p style={{ fontSize: 11, color: C.muted }}>穩定指數: 85%</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <PentagonRadar data={[0.8, 0.6, 0.7, 0.9, 0.5]} labels={['化學', '粉塵', '生物', '氣體', '氣候']} size={110} />
                  </div>
                </div>
                <div style={{ flex: 1, ...card, padding: 18, display: 'flex', flexDirection: 'column', minHeight: 200 }}>
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: 0.8, marginBottom: 3 }}>來源歸因</p>
                    <p style={{ fontSize: 11, color: C.muted }}>區域影響鄰近度</p>
                  </div>
                  <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <DonutChart />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                    {[{ color: C.primary, label: '工業' }, { color: '#7F5A6A', label: '交通' }].map(({ color, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 政策模擬結果 */}
              <div style={{ ...card, padding: 22, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>政策模擬結果</span>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: C.primary,
                    backgroundColor: C.primaryAlpha, padding: '4px 12px', borderRadius: 99,
                  }}>-{govThresholds.industrial}% 工業</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.hint, letterSpacing: 0.5 }}>工業產出削減</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{govThresholds.industrial}%</span>
                </div>
                <div style={{
                  padding: '12px 16px', borderRadius: 12,
                  backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
                }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: 0.8, marginBottom: 4 }}>預估結果</p>
                  <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
                    大園區 48 小時內預計改善 {Math.round(govThresholds.industrial * 0.8)}%
                  </p>
                </div>
              </div>

              {/* AI 策略推薦 */}
              <SectionLabel title="AI 策略推薦" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {strategies.map(({ Icon, bg, color, title, badge, badgeBg, badgeColor, desc }) => (
                  <div key={title} style={{ ...card, padding: 16, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                      backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={17} color={color} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{title}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: badgeColor, letterSpacing: 0.5,
                          backgroundColor: badgeBg, padding: '3px 10px', borderRadius: 99,
                        }}>{badge}</span>
                      </div>
                      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
    </AuthGuard>
  );
}
