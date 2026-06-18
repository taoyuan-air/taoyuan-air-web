'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { authApi } from '@/lib/api-client';

const C = {
  primary: '#D4567A', primaryAlpha: 'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)', text: '#1a1220',
  muted: '#7a6880', hint: '#b0a0b8',
  glass: 'rgba(255,255,255,0.80)', glassBorder: 'rgba(255,255,255,0.90)',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
  border: `1px solid ${C.primaryBorder}`, backgroundColor: 'rgba(255,255,255,0.7)',
  fontSize: 14, color: C.text, outline: 'none', fontFamily: 'inherit',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 6,
};

const DISTRICTS = [
  '桃園區','中壢區','八德區','龜山區','蘆竹區','大園區',
  '大溪區','平鎮區','楊梅區','龍潭區','觀音區','新屋區','復興區',
];

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: '', email: '', password: '', password_confirm: '',
    age_range: '', gender: '', default_district: '',
    sensitivity: '一般民眾', has_respiratory: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const formatError = (error: unknown): string => {
    if (!error) return '';
    if (typeof error === 'string') return error;
    if (Array.isArray(error)) return error.map((item) => formatError(item)).filter(Boolean).join(' / ');
    if (typeof error === 'object' && error !== null) {
      const payload = error as Record<string, unknown>;
      if (typeof payload.detail !== 'undefined') return formatError(payload.detail);
      if (typeof payload.message !== 'undefined') return formatError(payload.message);
      if (typeof payload.msg !== 'undefined') return formatError(payload.msg);
      return JSON.stringify(payload);
    }
    return String(error);
  };

  const set = (key: string, value: unknown) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.password_confirm) {
      setError('兩次密碼輸入不一致');
      return;
    }
    setLoading(true);
    const res = await authApi.register({
      ...form,
      default_district: form.default_district || null,
      age_range: form.age_range || null,
      gender: form.gender || null,
    });
    setLoading(false);
    if (res.ok) {
      router.push('/login?registered=1');
    } else {
      const data = await res.json().catch(() => ({}));
      const payload = data as Record<string, unknown>;
      const message = formatError(payload.detail ?? payload.message ?? payload);
      setError(message || '註冊失敗，請稍後再試');
    }
  };

  return (
    <div style={{
      minHeight: '92vh', background: 'var(--app-bg-gradient)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        backgroundColor: C.glass, border: `1px solid ${C.glassBorder}`,
        borderRadius: 24, padding: '40px 36px',
        boxShadow: '0 8px 32px rgba(180,140,160,0.14)',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>建立帳號</h1>
        <p style={{ fontSize: 13, color: C.hint, marginBottom: 28 }}>填寫以下資訊以建立您的 Taoyuan Air 帳號</p>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 12, marginBottom: 20,
            backgroundColor: 'rgba(233,76,120,0.10)', border: '1px solid rgba(233,76,120,0.30)',
            fontSize: 13, color: '#E94C78',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>用戶名稱 *</label>
              <input style={inputStyle} value={form.username} onChange={(e) => set('username', e.target.value)} required placeholder="您的名稱" />
            </div>
            <div>
              <label style={labelStyle}>電子郵件 *</label>
              <input style={inputStyle} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required placeholder="your@email.com" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>密碼 * (至少 8 碼)</label>
              <input
                style={{ ...inputStyle, padding: '11px 44px 11px 14px' }}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute', top: 38, right: 14, border: 'none', background: 'transparent',
                  padding: 0, cursor: 'pointer', color: C.muted,
                }}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>確認密碼 *</label>
              <input
                style={{ ...inputStyle, padding: '11px 44px 11px 14px' }}
                type={showPassword ? 'text' : 'password'}
                value={form.password_confirm}
                onChange={(e) => set('password_confirm', e.target.value)}
                required
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute', top: 38, right: 14, border: 'none', background: 'transparent',
                  padding: 0, cursor: 'pointer', color: C.muted,
                }}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div style={{ height: 1, backgroundColor: 'rgba(180,140,160,0.12)' }} />
          <p style={{ fontSize: 12, fontWeight: 700, color: C.hint, letterSpacing: 0.8 }}>健康資訊（選填）</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>年齡區間</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.age_range} onChange={(e) => set('age_range', e.target.value)}>
                {['18歲以下','18–24歲','25–34歲','35–44歲','45–54歲','55–64歲','65歲以上'].map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>性別</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="男性">男性</option>
                <option value="女性">女性</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>預設行政區</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.default_district} onChange={(e) => set('default_district', e.target.value)}>
              <option value="">不設定（使用定位或中壢區）</option>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <p style={{ fontSize: 11, color: C.hint, marginTop: 4 }}>若填寫，頁面預設顯示此區域資料；若未填寫，系統先嘗試定位，失敗則顯示中壢區</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>敏感度</label>
              <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.sensitivity} onChange={(e) => set('sensitivity', e.target.value)}>
                <option value="一般民眾">一般民眾</option>
                <option value="敏感族群">敏感族群</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input
                type="checkbox" id="resp" checked={form.has_respiratory}
                onChange={(e) => set('has_respiratory', e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: C.primary }}
              />
              <label htmlFor="resp" style={{ fontSize: 13, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                有氣喘 / 呼吸道疾病
              </label>
            </div>
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 8, padding: '13px 0', borderRadius: 99, cursor: loading ? 'wait' : 'pointer',
              backgroundColor: C.primary, border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, transition: 'opacity 0.18s', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '建立中...' : '建立帳號'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', marginTop: 20 }}>
          已有帳號？{' '}
          <Link href="/login" style={{ color: C.primary, fontWeight: 700, textDecoration: 'none' }}>
            立即登入
          </Link>
        </p>
      </div>
    </div>
  );
}
