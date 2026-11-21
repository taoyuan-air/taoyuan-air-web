'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/apiBase';
import type { MoeStation } from './districtStations';

/**
 * 近 24 小時逐時濃度。GET ${API_BASE}/explorer/history?days=1
 *
 * 實際回應結構(已對線上 API 驗證):{ data, count, latestAt, errors }
 *   - data: HistoryRecord[]  ← 逐時資料陣列
 *   - latestAt: { 環境部, 桃園市環保局, 中大空品站, 氣象署 } 各自最新資料日期
 *   - count, errors
 * 規格 §5.1 原寫「平攤陣列」,實際包在 data 內,故讀 response.data。
 *
 * 每筆 record 欄位(backend/app/routers/explorer.py _history_record):
 *   source, station(格式「{source} {station_name}」,如「環境部 中壢」),
 *   district, parameter(「PM2.5」「PM10」「O3」「NO2」「SO2」「CO」「NOx」),
 *   value(number), unit(字串,逐筆讀取,不得假設), observedAt(ISO), time。
 *
 * 單位備註(對線上 /moe + 後端程式碼推斷,需持續以實際 unit 欄位為準):
 *   PM2.5/PM10 → μg/m³;O3/SO2/NO2 → ppb;CO → ppm。歷史 unit 字串以回傳為準。
 *
 * 資料庫可能落後即時值:latestAt 顯示各 source 最新日期;若最新一筆距現在 > 6 小時,
 * 呼叫端應顯示「資料庫歷史資料更新較慢」提示(§5.4)。
 */

export interface HistoryRecord {
  id: string;
  source: string;
  station: string;
  district: string;
  region: string;
  parameter: string;
  value: number;
  unit: string;
  time: string;
  observedAt: string;
  passed: boolean;
  trend: string;
  version: string;
  aqi: number;
}

interface HistoryResponse {
  data: HistoryRecord[];
  count: number;
  latestAt: Record<string, string | null>;
  errors: Record<string, unknown>;
}

export interface UseStationHistoryResult {
  records: HistoryRecord[];
  latestAt: Record<string, string | null>;
  count: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStationHistory(): UseStationHistoryResult {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [latestAt, setLatestAt] = useState<Record<string, string | null>>({});
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/explorer/history?days=1`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as HistoryResponse;
        if (cancelled) return;
        setRecords(Array.isArray(json.data) ? json.data : []);
        setLatestAt(json.latestAt ?? {});
        setCount(json.count ?? 0);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setRecords([]);
        setLatestAt({});
        setCount(0);
        setError(e instanceof Error ? e.message : '資料暫時無法取得');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { records, latestAt, count, loading, error, refetch };
}

/**
 * 篩選指定參考測站(環境部)的逐時資料。
 * 比對 source 含「環境部」且 station 字串含測站名(如「中壢」)。
 */
export function filterByStation(records: HistoryRecord[], station: MoeStation): HistoryRecord[] {
  return records.filter(
    (r) => r.source && r.source.includes('環境部') && r.station && r.station.includes(station),
  );
}

/** 取指定污染物之逐時資料,並依時間由舊到新排序。 */
export function seriesFor(records: HistoryRecord[], parameter: string): HistoryRecord[] {
  return records
    .filter((r) => r.parameter === parameter)
    .sort((a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime());
}
