'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const C = {
  primary: '#D4567A',
  primaryAlpha: 'rgba(212,86,122,0.12)',
  primaryBorder: 'rgba(212,86,122,0.30)',
  text: '#1a1220',
  muted: '#7a6880',
  hint: '#b0a0b8',
  glass: 'rgba(255,255,255,0.80)',
  glassBorder: 'rgba(255,255,255,0.90)',
};

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.ok) {
      router.push('/dashboard');
    } else {
      setError(result.error ?? '登入失敗');
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--app-bg-gradient)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 440,
        backgroundColor: C.glass, border: `1px solid ${C.glassBorder}`,
        borderRadius: 24, padding: '40px 36px',
        boxShadow: '0 8px 32px rgba(180,140,160,0.14)',
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 6 }}>登入帳號</h1>
        <p style={{ fontSize: 13, color: C.hint, marginBottom: 28 }}>歡迎回來，請輸入您的帳號資訊</p>

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 12, marginBottom: 20,
            backgroundColor: 'rgba(233,76,120,0.10)', border: '1px solid rgba(233,76,120,0.30)',
            fontSize: 13, color: '#E94C78',
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 6 }}>
              電子郵件
            </label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required placeholder="your@email.com"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
                border: `1px solid ${C.primaryBorder}`, backgroundColor: 'rgba(255,255,255,0.7)',
                fontSize: 14, color: C.text, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.muted, display: 'block', marginBottom: 6 }}>
              密碼
            </label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
                border: `1px solid ${C.primaryBorder}`, backgroundColor: 'rgba(255,255,255,0.7)',
                fontSize: 14, color: C.text, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: 8, padding: '13px 0', borderRadius: 99, cursor: loading ? 'wait' : 'pointer',
              backgroundColor: C.primary, border: 'none', color: '#fff',
              fontSize: 15, fontWeight: 700, transition: 'opacity 0.18s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', marginTop: 20 }}>
          還沒有帳號？{' '}
          <Link href="/auth/register" style={{ color: C.primary, fontWeight: 700, textDecoration: 'none' }}>
            立即註冊
          </Link>
        </p>
        <p style={{ fontSize: 13, color: C.hint, textAlign: 'center', marginTop: 8 }}>
          <Link href="/dashboard" style={{ color: C.hint, textDecoration: 'none' }}>
            以訪客身份繼續瀏覽
          </Link>
        </p>
      </div>
    </div>
  );
}
