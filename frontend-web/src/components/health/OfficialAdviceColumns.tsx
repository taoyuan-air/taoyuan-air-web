'use client';

import {
  OFFICIAL_LEVEL_TEXT,
  OFFICIAL_SOURCE,
  type OfficialLevelText,
} from '@shared/constants/officialText';
import { type AqiLevel } from '@shared/constants/airHealth';
import { C, card } from './tokens';

function OfficialLinkFallback({ label }: { label: string }) {
  return (
    <a
      href={OFFICIAL_SOURCE.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontSize: 13, color: C.primary, fontWeight: 600, textDecoration: 'none' }}
    >
      {label}:前往官方原文 ↗
    </a>
  );
}

/** 來源小字:資料來源:環境部空氣品質指標 */
function SourceTag() {
  return (
    <span style={{ fontSize: 11, color: C.hint }}>資料來源:環境部空氣品質指標</span>
  );
}

/**
 * 官方兩欄活動建議 + 該級人體健康影響(M2/M1 共用)。
 * 逐字轉載原則(R1):有 OFFICIAL_LEVEL_TEXT 資料則逐字顯示;無則顯示「前往官方原文」連結,
 * 不得以自行撰寫文字代替。
 *
 * 個人化(R2):sensitive=true → 右欄(敏感性族群)加強調標記;否則左欄加。
 * 兩欄文字大小、對比、可讀性一致,不淡化另一欄。
 */
export function OfficialAdviceColumns({
  level,
  sensitive,
}: {
  level: AqiLevel | null;
  sensitive: boolean;
}) {
  const levelId = level?.id;
  const text: OfficialLevelText | undefined =
    levelId != null ? OFFICIAL_LEVEL_TEXT.find((l) => l.levelId === levelId) : undefined;

  const renderAdviceList = (items: string[]) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((line, i) => (
        <p key={i} style={{ fontSize: 13, lineHeight: 1.7, color: C.text, margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );

  const renderColumn = (
    title: string,
    items: string[] | undefined,
    highlight: boolean,
  ) => (
    <div
      style={{
        flex: 1,
        padding: 16,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.55)',
        border: `1.5px solid ${highlight ? C.primaryBorder : C.glassBorder}`,
        boxShadow: highlight ? `0 0 0 3px ${C.primaryAlpha}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</span>
        {highlight && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, color: C.primary, letterSpacing: 0.3,
              backgroundColor: C.primaryAlpha, padding: '2px 8px', borderRadius: 99,
            }}
          >
            依您的設定
          </span>
        )}
      </div>
      {items && items.length > 0 ? renderAdviceList(items) : <OfficialLinkFallback label={title} />}
    </div>
  );

  return (
    <div style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 該級人體健康影響 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>人體健康影響</span>
          {level && (
            <span
              style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                backgroundColor: `${level.hex}22`, color: C.text,
              }}
            >
              {level.label}
            </span>
          )}
        </div>
        {text ? (
          <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, margin: 0 }}>{text.healthImpact}</p>
        ) : (
          <OfficialLinkFallback label="人體健康影響" />
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SourceTag />
      </div>

      {/* 兩欄:一般民眾 / 敏感性族群 */}
      <div style={{ display: 'flex', gap: 14 }}>
        {renderColumn('一般民眾活動建議', text?.generalAdvice, !sensitive)}
        {renderColumn('敏感性族群活動建議', text?.sensitiveAdvice, sensitive)}
      </div>
    </div>
  );
}
