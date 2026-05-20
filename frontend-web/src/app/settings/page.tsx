'use client';

import Link from 'next/link';
import { Bell, ChevronLeft, ChevronRight, Heart, LogOut, Shield, Star, UserCheck } from 'lucide-react';

const palette = {
  bg: '#FFF6F9',
  bgEnd: '#FFEAF0',
  primary: '#E76595',
  primaryMid: '#FBA7BC',
  text: '#3A1E2D',
  muted: '#7F5A6A',
  border: 'rgba(231,101,149,0.16)',
  glass: 'rgba(255,255,255,0.58)',
};

const settings = [
  { title: '帳戶安全', icon: Shield, color: palette.primary },
  { title: '身份驗證', icon: UserCheck, color: palette.primaryMid },
  { title: '健康檔案設定', icon: Heart, color: palette.primary },
  { title: '通知偏好設定', icon: Bell, color: palette.primaryMid },
];

export default function SettingsPage() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 80px)',
      background: `linear-gradient(180deg, ${palette.bg}, ${palette.bgEnd})`,
      padding: '28px 24px 80px',
    }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}>
          <Link href="/dashboard" aria-label="返回總覽" style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.glass,
            border: `1px solid ${palette.border}`,
            textDecoration: 'none',
          }}>
            <ChevronLeft size={22} color={palette.text} />
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: palette.text, margin: 0 }}>用戶設定</h1>
          <div style={{ width: 42 }} />
        </header>

        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', marginBottom: 22 }}>
            <div style={{
              width: 88,
              height: 88,
              borderRadius: '50%',
              backgroundColor: '#D4B896',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 800,
              boxShadow: '0 8px 24px rgba(94,42,66,0.12)',
            }}>
              陳
            </div>
            <div style={{
              position: 'absolute',
              right: -12,
              bottom: -7,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 14,
              backgroundColor: palette.primary,
              border: '2px solid #fff',
              color: '#fff',
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.5,
            }}>
              <Star size={12} fill="white" />
              PREMIUM
            </div>
          </div>
          <p style={{ fontSize: 24, fontWeight: 800, color: palette.text, margin: '0 0 8px' }}>陳曉明</p>
          <p style={{ fontSize: 15, color: palette.muted, margin: 0 }}>wei-ting.chen@taoyuan.io</p>
        </section>

        <section style={{ display: 'grid', gap: 12 }}>
          {settings.map(({ title, icon: Icon, color }) => (
            <button key={title} style={{
              width: '100%',
              minHeight: 72,
              border: `1px solid ${palette.border}`,
              borderRadius: 18,
              backgroundColor: palette.glass,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 18px',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(94,42,66,0.05)',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Icon size={19} color="#fff" />
                </span>
                <span style={{ fontSize: 16, fontWeight: 700, color: palette.text }}>{title}</span>
              </span>
              <ChevronRight size={20} color="#9CA3AF" />
            </button>
          ))}
        </section>

        <button style={{
          margin: '28px auto 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 999,
          border: '1px solid rgba(231,111,81,0.22)',
          backgroundColor: 'rgba(231,111,81,0.08)',
          color: '#E76F51',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}>
          <LogOut size={16} />
          登出
        </button>
      </div>
    </div>
  );
}
