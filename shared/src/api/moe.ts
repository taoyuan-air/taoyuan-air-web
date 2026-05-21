import { MoeStationData } from '../types';

export type { MoeStationData } from '../types';

const MOE_TARGET_STATIONS = ['中壢', '桃園', '大園', '觀音', '平鎮', '龍潭'];


export function parseMoeRecords(records: any[]): MoeStationData[] {
  return records.map(record => ({
    sitename:         record.sitename ?? '',
    aqi:              Number(record.aqi)             || 0,
    pm25:             Number(record['pm2.5'])         || 0,
    o3:               Number(record.o3)               || 0,
    nox:              Number(record.nox ?? record.no2) || 0,
    datacreationdate: record.publishtime ?? undefined,
  }));
}

export const fetchMoeStations = async (apiKey?: string): Promise<MoeStationData[]> => {
  // Use globalThis to avoid TypeScript errors in cross-platform (Expo/Node) shared package
  const env = (globalThis as any).process?.env ?? {};
  const key = apiKey ?? env.EXPO_PUBLIC_MOE_API_KEY ?? env.NEXT_PUBLIC_MOE_API_KEY;

  if (!key) {
    console.warn('[MOE] API key 未設定，跳過請求');
    return [];
  }

  const buildUrl = (station: string) => {
    const params = new URLSearchParams({ format: 'json', offset: '0', limit: '10', api_key: key });
    params.append('filters', `SiteName,EQ,${station}`);
    return `https://data.moenv.gov.tw/api/v2/aqx_p_432?${params.toString()}`;
  };

  try {
    const settled = await Promise.allSettled(
      MOE_TARGET_STATIONS.map(station =>
        fetch(buildUrl(station)).then(async res => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`MOE API 錯誤 ${res.status}: ${text.slice(0, 200)}`);
          }
          return res.json().catch(() => null);
        })
      )
    );

    let allRecords: any[] = [];
    settled.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[MOE] 站點 ${MOE_TARGET_STATIONS[index]} 失敗:`, result.reason);
        return;
      }
      const r = result.value;
      if (Array.isArray(r))  allRecords = allRecords.concat(r);
      else if (r?.records)   allRecords = allRecords.concat(r.records);
    });

    return parseMoeRecords(allRecords);
  } catch (err) {
    console.error('[MOE] 拉取資料失敗:', err);
    return [];
  }
};
