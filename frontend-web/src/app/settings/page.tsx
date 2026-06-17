'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { authApi } from '@/lib/api-client';
import Image from 'next/image';
import {
  Bell, Camera, Check, CheckCircle2, ChevronRight,
  Eye, EyeOff, Heart, Key, LogOut, Settings, Shield,
  Star, UserCheck, Wind, Trash2
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

type Section = '基本資料' | '帳戶安全' | '身份驗證' | '健康檔案' | '通知偏好';

const NAV: { key: Section; Icon: React.ElementType; desc: string }[] = [
  { key: '基本資料', Icon: Settings,   desc: '頭像、名稱與信箱' },
  { key: '帳戶安全', Icon: Shield,     desc: '密碼與登入方式' },
  { key: '身份驗證', Icon: UserCheck,  desc: '帳號驗證狀態' },
  { key: '健康檔案', Icon: Heart,      desc: '個人健康資訊' },
  { key: '通知偏好', Icon: Bell,       desc: '警報與推播設定' },
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2, marginTop: 10 }}>
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
  const [activeSection, setActiveSection] = useState<Section>('基本資料');
  const [saved, setSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { user, refreshUser, logout } = useAuth();

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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [now] = useState(Date.now);
  const passwordChangedAgo = useMemo(() => {
    if (!user?.password_changed_at) return '—';
    const diffInDays = Math.floor(
      (now - new Date(user.password_changed_at).getTime()) / 86400000
    );
    return new Intl.RelativeTimeFormat('zh-TW', { numeric: 'auto' }).format(-diffInDays, 'day');
  }, [user, now]);

  const router = useRouter();
  const handleLogout = async () => {
    await logout();
    router.push('/dashboard');
  };

  const handleEditStart = () => {
    setEditUsername(username);
    setEditEmail(email);
    setEditMode(true);
    setSaveError('');
  };

  const handleEditCancel = () => {
    setEditMode(false);
    setSaveError('');
  };

  const handleEditSave = async () => {
    setSaveError('');
    try {
      const res = await authApi.updateProfile({ username: editUsername, email: editEmail });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(parseApiError(data));
        return;
      }
      await refreshUser();
      setEditMode(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('網路錯誤，請稍後再試');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const res = await authApi.deleteAccount();
      if (res.ok || res.status === 204) {
        await logout();
        router.push('/login');
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(parseApiError(data));
        setShowDeleteModal(false);
      }
    } catch {
      setSaveError('網路錯誤，請稍後再試');
      setShowDeleteModal(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* 通知偏好 state */
  const [notifs, setNotifs] = useState(INIT.notifs);

  useEffect(() => {
    if (!user) return;
    // Defer state updates to avoid synchronous setState inside effect
    const t = setTimeout(() => {
      setTwoFactor(user.two_factor_enabled);
      setConditions({
        asthma: user.has_respiratory,
        elderly: user.has_elderly,
        child: user.has_child,
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
    profileSensitivity !== user.sensitivity ||
    conditions.asthma !== user.has_respiratory ||
    conditions.elderly !== user.has_elderly ||
    conditions.child !== user.has_child
  );

  const profileDirty = user && (
    username !== (user.username ?? '') || email !== (user.email ?? '')
  );

  const securityDirty = user ? (
    twoFactor !== user.two_factor_enabled ||
    !!currentPassword || !!newPassword || !!newPasswordConfirm
  ) : false;

  const notifsDirty = user && (
    notifs.pm25 !== user.notif_pm25 ||
    notifs.aqi !== user.notif_aqi ||
    notifs.health !== user.notif_health ||
    notifs.system !== user.notif_system
  );

  const isDirty =
    securityDirty ||
    !!notifsDirty ||
    !!healthDirty || !!profileDirty;

  function parseApiError(data: { detail?: unknown }): string {
    const d = data.detail;
    if (Array.isArray(d)) return d.map((e: { msg: string }) => e.msg).join('、');
    if (typeof d === 'string') return d;
    return '儲存失敗';
  }

  const handleSave = async () => {
    setSaveError('');
    try {
      if (activeSection === '基本資料') {
        if (profileDirty) {
          const resProfile = await authApi.updateProfile({ username, email });
          if (!resProfile.ok) {
            const data = await resProfile.json().catch(() => ({}));
            setSaveError(parseApiError(data));
            return;
          }
        }
      } else if (activeSection === '帳戶安全') {
        // update profile if changed
        if (profileDirty) {
          const resProfile = await authApi.updateProfile({ username, email });
          if (!resProfile.ok) {
            const data = await resProfile.json().catch(() => ({}));
            setSaveError(parseApiError(data));
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
          setSaveError(parseApiError(data));
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
          has_elderly: conditions.elderly,
          has_child: conditions.child,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(parseApiError(data));
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
          setSaveError(parseApiError(data));
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

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {isDirty && !saved && (
              <span 
                style={{ 
                  padding: '9px 20px', borderRadius: 99, fontSize: 12, color: C.primary, fontWeight: 600, marginRight: 15,
                  backgroundColor: saved ? 'rgba(92,138,118,0.12)' : isDirty ? C.primaryAlpha : 'rgba(180,140,160,0.08)',
                  border: `1px solid ${saved ? 'rgba(92,138,118,0.30)' : isDirty ? C.primaryBorder : 'rgba(180,140,160,0.18)'}`,  
                }}
              >
                有尚未儲存的變更
              </span>
            )}
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

          {/* ── 左欄： Nav + 登出 ──────────────────────────── */}
          <div style={{
            width: isMobile ? '100%' : 300,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            marginTop: isMobile ? 0 : 10,
          }}>

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
            <button onClick={handleLogout} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 0', borderRadius: 14, cursor: 'pointer',
              backgroundColor: 'rgba(196,97,74,0.14)', border: '1.5px solid rgba(196,97,74,0.32)',
              fontSize: 14, fontWeight: 700, color: C.coral,
              transition: 'all 0.15s',
            }}>
              <LogOut size={16} strokeWidth={2} />
              登出帳號
            </button>
          </div>{/* 左欄結束 */}

          {/* ── 右欄：Section 內容 ─────────────────────────────────── */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ── 基本資料 ── */}
            {activeSection === '基本資料' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="基本資料" />

                <div style={{ ...card, padding: 28 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 20 }}>基本資料</p>

                  {/* 頭像 */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
                    <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => document.getElementById('avatar-upload')?.click()}>
                      <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        backgroundColor: '#D4B896', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, fontWeight: 800,
                        boxShadow: '0 6px 20px rgba(94,42,66,0.14)',
                        overflow: 'hidden',
                      }}>
                        {avatarUrl ? (
                          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <Image src={avatarUrl} alt="avatar" fill sizes="80px" style={{ objectFit: 'cover' }} />
                          </div>
                        ) : (
                          user?.username ? user.username.split(' ').map((n: string) => n[0]).slice(0, 2).join('') : 'U'
                        )}
                      </div>
                      <div style={{
                        position: 'absolute', bottom: 0, right: 0,
                        width: 24, height: 24, borderRadius: '50%',
                        backgroundColor: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      }}>
                        <Camera size={12} color="#fff" strokeWidth={2.5} />
                      </div>
                      <input
                        id="avatar-upload" type="file" accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setAvatarUrl(URL.createObjectURL(file));
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {editMode ? (
                      <>
                        {/* 用戶名稱 input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>用戶名稱</span>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            style={{
                              padding: '11px 14px', borderRadius: 12,
                              border: `1.5px solid ${C.primaryBorder}`,
                              backgroundColor: 'rgba(255,255,255,0.85)',
                              fontSize: 14, color: C.text, fontWeight: 500,
                              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        {/* 電子信箱 input */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>電子信箱</span>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            style={{
                              padding: '11px 14px', borderRadius: 12,
                              border: `1.5px solid ${C.primaryBorder}`,
                              backgroundColor: 'rgba(255,255,255,0.85)',
                              fontSize: 14, color: C.text, fontWeight: 500,
                              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <FieldRow
                          label="帳號建立日期"
                          value={user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                        />
                        {/* 編輯模式按鈕列 */}
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <button
                            onClick={handleEditSave}
                            style={{
                              flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                              backgroundColor: C.primaryAlpha, border: `1.5px solid ${C.primaryBorder}`,
                              fontSize: 13, fontWeight: 700, color: C.primary,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                            儲存變更
                          </button>
                          <button
                            onClick={handleEditCancel}
                            style={{
                              flex: 1, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                              backgroundColor: 'rgba(180,140,160,0.08)', border: `1.5px solid rgba(180,140,160,0.20)`,
                              fontSize: 13, fontWeight: 700, color: C.muted,
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <FieldRow label="用戶名稱" value={username || '—'} />
                        <FieldRow label="電子信箱" value={email || '—'} />
                        <FieldRow
                          label="帳號建立日期"
                          value={user?.created_at ? new Date(user.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}
                        />
                        {/* 編輯按鈕 */}
                        <button
                          onClick={handleEditStart}
                          style={{
                            marginTop: 4, padding: '11px 0', borderRadius: 12, cursor: 'pointer',
                            backgroundColor: C.primaryAlpha, border: `1.5px solid ${C.primaryBorder}`,
                            fontSize: 13, fontWeight: 700, color: C.primary,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}
                        >
                          編輯個人資料
                        </button>
                      </>
                    )}
                  </div>

                  {/* 刪除帳號 */}
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 40,
                    padding: '13px 0', borderRadius: 14, cursor: 'pointer',
                    backgroundColor: 'rgba(220,38,38,0.08)', border: '1.5px dashed rgba(220,38,38,0.40)',
                    fontSize: 14, fontWeight: 700, color: '#DC2626',
                    transition: 'all 0.15s',
                  }}>
                    <Trash2 size={16} strokeWidth={2} />
                    刪除帳號
                  </button>
                </div>

              </div>
            )}

            {/* ── 帳戶安全 ── */}
            {activeSection === '帳戶安全' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <SectionLabel title="帳戶安全" />

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
                            上次變更：{passwordChangedAgo}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                      {/* 目前密碼 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>目前密碼</span>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showCurrentPw ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="••••••••"
                            style={{
                              padding: '11px 40px 11px 14px', borderRadius: 12,
                              border: `1px solid ${C.glassBorder}`,
                              backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text,
                              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPw(p => !p)}
                            style={{
                              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.hint,
                            }}
                          >
                            {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* 新密碼 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>新密碼（至少 8 碼）</span>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showNewPw ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            style={{
                              padding: '11px 40px 11px 14px', borderRadius: 12,
                              border: `1px solid ${C.glassBorder}`,
                              backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text,
                              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPw(p => !p)}
                            style={{
                              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.hint,
                            }}
                          >
                            {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* 確認新密碼 + 確認按鈕 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>確認新密碼</span>
                        <div style={{ position: 'relative' }}>
                          <input
                            type={showConfirmPw ? 'text' : 'password'}
                            value={newPasswordConfirm}
                            onChange={(e) => setNewPasswordConfirm(e.target.value)}
                            placeholder="••••••••"
                            style={{
                              padding: '11px 40px 11px 14px', borderRadius: 12,
                              border: `1px solid ${
                                newPasswordConfirm && newPassword
                                  ? newPassword === newPasswordConfirm ? 'rgba(92,138,118,0.50)' : 'rgba(233,76,120,0.50)'
                                  : C.glassBorder
                              }`,
                              backgroundColor: 'rgba(255,255,255,0.6)', fontSize: 14, color: C.text,
                              fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPw(p => !p)}
                            style={{
                              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.hint,
                            }}
                          >
                            {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {/* 確認更改密碼按鈕 */}
                        <button
                          onClick={handleSave}
                          style={{
                            marginTop: 20, padding: '10px 0', borderRadius: 12, cursor: 'pointer',
                            backgroundColor: C.primaryAlpha, border: `1px solid ${C.primaryBorder}`,
                            fontSize: 13, fontWeight: 700, color: C.primary,
                          }}
                        >
                          確認更改密碼
                        </button>
                      </div>
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

        </div>{/* 兩層Layout結束 */}
    </div>

      {/* ── 刪除帳號確認 Modal ─────────────────────────────────── */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(26,18,32,0.55)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '20px',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteModal(false); }}
        >
          <div style={{
            ...card,
            padding: 32, maxWidth: 420, width: '100%',
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            {/* 警示圖示 */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                backgroundColor: 'rgba(220,38,38,0.10)',
                border: '1.5px solid rgba(220,38,38,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={24} color="#DC2626" strokeWidth={2} />
              </div>
            </div>

            {/* 標題與說明 */}
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>確認刪除帳號？</p>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
                此操作將永久刪除您的帳號及所有相關資料，<br />
                <strong style={{ color: '#DC2626' }}>無法復原</strong>，請確認後再繼續。
              </p>
            </div>

            {/* 按鈕列 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, cursor: deleteLoading ? 'default' : 'pointer',
                  backgroundColor: deleteLoading ? 'rgba(220,38,38,0.05)' : 'rgba(220,38,38,0.10)',
                  border: '1.5px solid rgba(220,38,38,0.35)',
                  fontSize: 14, fontWeight: 700, color: '#DC2626',
                  opacity: deleteLoading ? 0.7 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {deleteLoading ? '刪除中…' : '確認刪除帳號'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleteLoading}
                style={{
                  width: '100%', padding: '13px 0', borderRadius: 12, cursor: 'pointer',
                  backgroundColor: 'rgba(180,140,160,0.08)', border: `1.5px solid rgba(180,140,160,0.20)`,
                  fontSize: 14, fontWeight: 700, color: C.muted,
                  transition: 'all 0.15s',
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

  </div>
  );
}
