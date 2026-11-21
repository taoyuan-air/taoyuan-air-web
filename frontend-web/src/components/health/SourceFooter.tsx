'use client';

import { C } from './tokens';

interface SourceFooterProps {
  /** 資料來源名稱,如「環境部空氣品質監測網(測站即時資料)」 */
  source: string;
  /** 資料時間,如 datacreationdate 或統計區間 */
  dataTime?: string;
  /** 取得時間,如重新整理當下 */
  retrievedAt?: string;
}

/**
 * 卡片底部固定顯示「資料來源 + 資料時間」(R3)。
 */
export function SourceFooter({ source, dataTime, retrievedAt }: SourceFooterProps) {
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 10,
        borderTop: '1px solid rgba(30,58,95,0.10)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontSize: 11, color: C.hint }}>資料來源:{source}</span>
      {dataTime && <span style={{ fontSize: 11, color: C.hint }}>資料時間:{dataTime}</span>}
      {retrievedAt && <span style={{ fontSize: 11, color: C.hint }}>取得時間:{retrievedAt}</span>}
    </div>
  );
}
