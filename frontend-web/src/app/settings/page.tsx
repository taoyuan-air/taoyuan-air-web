'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api-client';
import {
  Bell, Check, CheckCircle2, ChevronRight,
  Heart, Key, LogOut, Settings, Shield,
  Star, UserCheck, Wind,
} from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────── */
const C = {
  primary:       '#D4567A',
  primaryAlpha:  'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)',
  coral:         '#C4614A',
  coralAlpha:    'rgba(196,97,74,0.10)',
  coralBorder:   'rgba(196,97,74,0.25)',
  glass:         'rgba(255,255,255,0.52)',
  glassBorder:   'rgba(255,255,255,0.72)',
  glassShadow:   '0 4px 16px rgba(180,140,160,0.10)',
  text:          '#1a1220',
  muted:         '#7a6880',
  hint:          '#b0a0b8',
};

const card: React.CSSProperties = {
  backgroundColor: C.glass,
  border: `1px solid ${C.glassBorder}`,
  borderRadius: 20,
  boxShadow: C.glassShadow,
};

type Section = '帳戶安全' | '身份驗證' | '健康檔案' | '通知偏好';

const NAV: { key: Section; Icon: React.ElementType; desc: string }[] = [
  { key: '帳戶安全', Icon: Shield,    desc: '密碼與登入方式' },
  { key: '身份驗證', Icon: UserCheck, desc: '帳號驗證狀態' },
  { key: '健康檔案', Icon: Heart,     desc: '個人健康資訊' },
  { key: '通知偏好', Icon: Bell,      desc: '警報與推播設定' },
];

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

/* ─── Section label ──────────────────────────────────────────── */
function SectionLabel({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingLeft: 2 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: C.primary, boxShadow: `0 0 6px ${C.primaryAlpha}` }} />
      <span style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: 0.2 }}>{title}</span>
    </div>
  );
}

/* ─── Field row ──────────────────────────────────────────────── */
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>{label}</span>
      <div style={{
        padding: '11px 14px', borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.6)',
        border: `1px solid ${C.glassBorder}`,
        fontSize: 14, color: C.text, fontWeight: 500,
      }}>{value}</div>
    </div>
  );
}

/* ─── Toggle row ─────────────────────────────────────────────── */
function ToggleRow({
  Icon, iconColor, iconBg, title, desc, value, onChange,
}: {
  Icon: React.ElementType; iconColor: string; iconBg: string;
  title: React.ReactNode; desc: React.ReactNode; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={iconColor} strokeWidth={2} />
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{title}</p>
        <p style={{ fontSize: 12, color: C.hint }}>{desc}</p>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

const INIT = {
  twoFactor: false,
  conditions: { asthma: true, elderly: false, child: false },
  notifs: { pm25: true, aqi: true, health: false, system: true },
};

/* ═══════════════════════════════════════════════════════════════ */
export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>('帳戶安全');
  const [saved, setSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* 帳戶安全 state */
  const [twoFactor, setTwoFactor] = useState(INIT.twoFactor);

  /* 健康檔案 state */
  const [conditions, setConditions] = useState(INIT.conditions);
  const [profileDistrict, setProfileDistrict] = useState('');
  const [profileAgeRange, setProfileAgeRange] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const [profileSensitivity, setProfileSensitivity] = useState('一般民眾');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [saveError, setSaveError] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  /* 通知偏好 state */
  const [notifs, setNotifs] = useState(INIT.notifs);

  useEffect(() => {
    if (!user) return;
    // Defer state updates to avoid synchronous setState inside effect
    const t = setTimeout(() => {
      setTwoFactor(user.two_factor_enabled);
      setConditions({
        asthma: user.has_respiratory,
        elderly: false,
        child: false,
      });
      setNotifs({
        pm25: user.notif_pm25,
        aqi: user.notif_aqi,
        health: user.notif_health,
        system: user.notif_system,
      });
      if (user.default_district) setProfileDistrict(user.default_district);
      if (user.age_range) setProfileAgeRange(user.age_range);
      if (user.gender) setProfileGender(user.gender);
      if (user.sensitivity) setProfileSensitivity(user.sensitivity);
      setUsername(user.username);
      setEmail(user.email);
    }, 0);

    return () => clearTimeout(t);
  }, [user]);

  const healthDirty = user && (
    profileAgeRange !== (user.age_range ?? '') ||
    profileGender !== (user.gender ?? '') ||
    profileDistrict !== (user.default_district ?? '') ||
    profileSensitivity !== user.sensitivity
  );

  const profileDirty = user && (
    username !== (user.username ?? '') || email !== (user.email ?? '')
  );

  const isDirty =
    twoFactor !== INIT.twoFactor ||
    JSON.stringify(conditions) !== JSON.stringify(INIT.conditions) ||
    JSON.stringify(notifs) !== JSON.stringify(INIT.notifs) ||
    !!healthDirty || !!profileDirty;

  const handleSave = async () => {
    setSaveError('');
    try {
      if (activeSection === '帳戶安全') {
        // update profile if changed
        if (profileDirty) {
          const resProfile = await authApi.updateProfile({ username, email });
          if (!resProfile.ok) {
            const data = await resProfile.json().catch(() => ({}));
            setSaveError(data.detail ?? '儲存失敗');
            return;
          }
        }

        const payload: Record<string, unknown> = { two_factor_enabled: twoFactor };
        if (newPassword) {
          if (newPassword !== newPasswordConfirm) {
            setSaveError('兩次新密碼輸入不一致');
            return;
          }
          payload.current_password = currentPassword;
          payload.new_password = newPassword;
        }
        const res = await authApi.updateSecurity(payload);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.detail ?? '儲存失敗');
          return;
        }
        setCurrentPassword('');
        setNewPassword('');
        setNewPasswordConfirm('');
      } else if (activeSection === '健康檔案') {
        const res = await authApi.updateHealth({
          age_range: profileAgeRange || null,
          gender: profileGender || null,
          default_district: profileDistrict || null,
          sensitivity: profileSensitivity,
          has_respiratory: conditions.asthma,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.detail ?? '儲存失敗');
          return;
        }
      } else if (activeSection === '通知偏好') {
        const res = await authApi.updateNotifications({
          notif_pm25: notifs.pm25,
          notif_aqi: notifs.aqi,
          notif_health: notifs.health,
          notif_system: notifs.system,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.detail ?? '儲存失敗');
          return;
        }
      }
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('網路錯誤，請稍後再試');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg-gradient)', paddingBottom: 100 }}>
      <div style={{ padding: isMobile ? '20px 16px 80px' : '28px 40px 32px' }}>

        {/* ── Page header（只放標題 + 儲存按鈕）──────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Settings size={18} color={C.primary} strokeWidth={2} />
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0, lineHeight: 1.2 }}>用戶設定</h1>
              <p style={{ fontSize: 12, color: C.hint, margin: 0, marginTop: 2 }}>管理帳號、健康資訊與通知偏好</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={!isDirty && !saved}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 99, cursor: isDirty ? 'pointer' : 'default',
              backgroundColor: saved ? 'rgba(92,138,118,0.12)' : isDirty ? C.primaryAlpha : 'rgba(180,140,160,0.08)',
              border: `1px solid ${saved ? 'rgba(92,138,118,0.30)' : isDirty ? C.primaryBorder : 'rgba(180,140,160,0.18)'}`,
              fontSize: 13, fontWeight: 700,
              color: saved ? '#5C8A76' : isDirty ? C.primary : C.hint,
              transition: 'all 0.18s',
            }}
          >
            <Check size={15} strokeWidth={2.5} />
            {saved ? '已儲存' : '儲存變更'}
          </button>
        </div>

        {/* ── 錯誤訊息（獨立於 header 之外）────────────────────── */}
        {saveError && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            backgroundColor: 'rgba(233,76,120,0.10)', border: '1px solid rgba(233,76,120,0.30)',
            fontSize: 13, color: '#E94C78',
          }}>{saveError}</div>
        )}

        {/* ── 兩欄 Layout ────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 20 : 28,
          alignItems: 'flex-start',
          marginTop: 20,
        }}>

          {/* ── 左欄：頭像 + Nav + 登出 ──────────────────────────── */}
          <div style={{
            width: isMobile ? '100%' : 300,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>

            {/* 頭像 + 帳號輸入 */}
            <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: isMobile ? 56 : 72, height: isMobile ? 56 : 72, borderRadius: '50%',
                backgroundColor: '#D4B896', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: isMobile ? 20 : 26, fontWeight: 800,
                boxShadow: '0 6px 20px rgba(94,42,66,0.14)',
              }}>
                {user?.username ? user.username.split(' ').map(n => n[0]).slice(0, 2).join('') : 'U'}
              </div>

              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="用戶名稱"
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.glassBorder}`,
                    backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 800,
                    color: C.text, outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="電子郵件"
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.glassBorder}`,
                    backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 12, color: C.hint,
                    outline: 'none', width: '100%', boxSizing: 'border-box',
                  }}
                />
              </div>

              {!isMobile && (
                <div style={{
                  width: '100%', padding: '8px 14px', borderRadius: 12,
                  backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>會員方案</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.primary }}>Premium</span>
                </div>
              )}
            </div>

            {/* Nav */}
            {isMobile ? (
              <div style={{
                display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4,
                scrollbarWidth: 'none',
              }}>
                {NAV.map(({ key, Icon }) => {
                  const active = activeSection === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7,
                        padding: '9px 16px', borderRadius: 99, flexShrink: 0,
                        cursor: 'pointer', border: `1px solid ${active ? C.primaryBorder : C.glassBorder}`,
                        backgroundColor: active ? C.primaryAlpha : C.glass,
                        fontSize: 13, fontWeight: active ? 700 : 500,
                        color: active ? C.primary : C.muted,
                        transition: 'all 0.15s',
                      }}
                    >
                      <Icon size={14} strokeWidth={2} />
                      {key}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ ...card, padding: 8 }}>
                {NAV.map(({ key, Icon, desc }) => {
                  const active = activeSection === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                        border: 'none', textAlign: 'left',
                        backgroundColor: active ? C.primaryAlpha : 'transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <div style={{
                        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                        backgroundColor: active ? C.primaryBorder : 'rgba(180,140,160,0.10)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background-color 0.15s',
                      }}>
                        <Icon size={16} color={active ? C.primary : C.muted} strokeWidth={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: active ? 700 : 500, color: active ? C.primary : C.text, marginBottom: 1 }}>{key}</p>
                        <p style={{ fontSize: 11, color: C.hint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</p>
                      </div>
                      <ChevronRight size={14} color={active ? C.primary : C.hint} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* 登出 */}
            <button style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 0', borderRadius: 14, cursor: 'pointer',
              backgroundColor: 'rgba(196,97,74,0.14)', border: '1.5px solid rgba(196,97,74,0.32)',
              fontSize: 14, fontWeight: 700, color: C.coral,
              transition: 'all 0.15s',
            }}>
              <LogOut size={16} strokeWidth={2} />
              登出帳號
            </button>
          </div>

          {/* ── 右欄：Section 內容 ─────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── 帳戶安全 ── */}
            {activeSection === '帳戶安全' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="帳戶安全" />

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>基本資料</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>用戶名稱</span>
                      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用戶名稱"
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>電子信箱</span>
                      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="電子郵件"
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>帳號建立日期</span>
                      <div style={{ padding: '11px 14px', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.6)', border: `1px solid ${C.glassBorder}`, fontSize: 14, color: C.text }}>
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>登入安全</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <ToggleRow
                      Icon={Key} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="雙因素驗證" desc="使用驗證器 App 進行第二步驟確認"
                      value={twoFactor} onChange={setTwoFactor}
                    />
                    <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>登入密碼</p>
                          <p style={{ fontSize: 12, color: C.hint }}>
                            上次變更：{user?.password_changed_at
                              ? new Intl.RelativeTimeFormat('zh-TW', { numeric: 'auto' }).format(
                                  -Math.floor((Date.now() - new Date(user.password_changed_at).getTime()) / 86400000), 'day'
                                )
                              : '—'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                        {[
                          { label: '目前密碼', value: currentPassword, setter: setCurrentPassword, placeholder: '••••••••' },
                          { label: '新密碼（至少 8 碼）', value: newPassword, setter: setNewPassword, placeholder: '••••••••' },
                          { label: '確認新密碼', value: newPasswordConfirm, setter: setNewPasswordConfirm, placeholder: '••••••••' },
                        ].map(({ label, value, setter, placeholder }) => (
                          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>{label}</span>
                            <input
                              type="password" value={value} onChange={(e) => setter(e.target.value)}
                              placeholder={placeholder}
                              style={{
                                padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`,
                                backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text,
                                fontFamily: 'inherit', outline: 'none',
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── 身份驗證 ── */}
            {activeSection === '身份驗證' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="身份驗證" />
                <div style={{ ...card, padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {[
                    { label: '電子信箱驗證', sub: 'wei-ting.chen@taoyuan.io', done: true },
                    { label: '手機號碼綁定', sub: '+886 9xx-xxx-xxx', done: true },
                    { label: '政府機關身份認證', sub: '桃園市政府環保局人員', done: false },
                  ].map(({ label, sub, done }) => (
                    <div key={label} style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 18px', borderRadius: 14,
                      backgroundColor: done ? C.primaryAlpha : 'rgba(180,140,160,0.07)',
                      border: `1px solid ${done ? C.primaryBorder : 'rgba(180,140,160,0.15)'}`,
                    }}>
                      <CheckCircle2
                        size={22} strokeWidth={2}
                        color={done ? C.primary : C.hint}
                        fill={done ? C.primaryAlpha : 'none'}
                      />
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: done ? C.text : C.muted, marginBottom: 2 }}>{label}</p>
                        <p style={{ fontSize: 12, color: C.hint }}>{sub}</p>
                      </div>
                      {!done && (
                        <button style={{
                          padding: '7px 16px', borderRadius: 99, cursor: 'pointer',
                          backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
                          fontSize: 12, fontWeight: 700, color: C.primary,
                        }}>前往驗證</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 健康檔案 ── */}
            {activeSection === '健康檔案' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="健康檔案設定" />

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>基本健康資訊</p>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>年齡區間</span>
                      <select value={profileAgeRange} onChange={(e) => setProfileAgeRange(e.target.value)}
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="">不提供</option>
                        {['18歲以下','18–24歲','25–34歲','35–44歲','45–54歲','55–64歲','65歲以上'].map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>性別</span>
                      <select value={profileGender} onChange={(e) => setProfileGender(e.target.value)}
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="">不提供</option>
                        <option value="男性">男性</option>
                        <option value="女性">女性</option>
                        <option value="其他">其他</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>所在行政區</span>
                      <select value={profileDistrict} onChange={(e) => setProfileDistrict(e.target.value)}
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="">使用定位 / 中壢區</option>
                        {['桃園區','中壢區','八德區','龜山區','蘆竹區','大園區','大溪區','平鎮區','楊梅區','龍潭區','觀音區','新屋區','復興區'].map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>敏感度預設</span>
                      <select value={profileSensitivity} onChange={(e) => setProfileSensitivity(e.target.value)}
                        style={{ padding: '11px 14px', borderRadius: 12, border: `1px solid ${C.glassBorder}`, backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                        <option value="一般民眾">一般民眾</option>
                        <option value="敏感族群">敏感族群</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>特殊健康狀況</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <ToggleRow
                      Icon={Wind} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="氣喘 / 呼吸道疾病" desc={<>調低 PM<sub style={{ fontSize: '0.75em' }}>2.5</sub> 警報門檻至 15 µg/m³</>}
                      value={conditions.asthma} onChange={(v) => setConditions(p => ({ ...p, asthma: v }))}
                    />
                    <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
                    <ToggleRow
                      Icon={Heart} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="年長者 (65 歲以上)" desc="啟用額外健康警示與建議"
                      value={conditions.elderly} onChange={(v) => setConditions(p => ({ ...p, elderly: v }))}
                    />
                    <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
                    <ToggleRow
                      Icon={Star} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="兒童 (12 歲以下)" desc="針對兒童調整戶外活動建議"
                      value={conditions.child} onChange={(v) => setConditions(p => ({ ...p, child: v }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── 通知偏好 ── */}
            {activeSection === '通知偏好' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="通知偏好設定" />

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>警報通知</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <ToggleRow
                      Icon={Shield} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title={<>PM<sub style={{ fontSize: '0.75em' }}>2.5</sub> 超標警報</>} desc="濃度超過設定門檻時即時通知"
                      value={notifs.pm25} onChange={(v) => setNotifs(p => ({ ...p, pm25: v }))}
                    />
                    <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
                    <ToggleRow
                      Icon={Wind} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="AQI 每日摘要" desc="每天早上 7:00 發送空氣品質報告"
                      value={notifs.aqi} onChange={(v) => setNotifs(p => ({ ...p, aqi: v }))}
                    />
                  </div>
                </div>

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>其他通知</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <ToggleRow
                      Icon={Heart} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="健康建議推播" desc="AI 根據空氣狀況提供活動建議"
                      value={notifs.health} onChange={(v) => setNotifs(p => ({ ...p, health: v }))}
                    />
                    <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
                    <ToggleRow
                      Icon={Bell} iconColor={C.primary} iconBg={C.primaryAlpha}
                      title="系統更新通知" desc="版本更新與新功能上線通報"
                      value={notifs.system} onChange={(v) => setNotifs(p => ({ ...p, system: v }))}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>{/* 右欄結束 */}
        </div>{/* 兩欄 Layout 結束 */}
      </div>
    </div>
  );
}
