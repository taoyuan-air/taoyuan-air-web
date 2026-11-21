'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MoeStationData } from '@shared/api/moe';
import { API_BASE } from '@/lib/apiBase';

interface MoeResponse {
  data: MoeStationData[];
  isFallback: boolean;
}

export interface UseMoeCurrentResult {
  data: MoeStationData[];
  isFallback: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * 取得環境部即時 AQI 與六項濃度。GET ${API_BASE}/moe
 * 回傳 { data: MoeStationData[], isFallback }。後端快取 1 小時(X-Cache header)。
 * 6 站:中壢、桃園、大園、觀音、平鎮、龍潭;sitename 不帶「站」(直接比對)。
 */
export function useMoeCurrent(): UseMoeCurrentResult {
  const [data, setData] = useState<MoeStationData[]>([]);
  const [isFallback, setIsFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/moe`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as MoeResponse;
        if (cancelled) return;
        setData(Array.isArray(json.data) ? json.data : []);
        setIsFallback(json.isFallback === true);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setData([]);
        setIsFallback(true);
        setError(e instanceof Error ? e.message : '資料暫時無法取得');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { data, isFallback, loading, error, refetch };
}

/** 依參考測站名稱(如「中壢」)取出對應的即時資料。sitename 與站名直接相等。 */
export function findStationData(data: MoeStationData[], station: string): MoeStationData | undefined {
  return data.find((d) => d.sitename === station);
}
