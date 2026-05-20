import { MoeStationData } from '../types';

export type { MoeStationData } from '../types';

const MOE_TARGET_STATIONS = ['中壢', '桃園', '大園', '觀音', '平鎮', '龍潭'];

export const fetchMoeStations = async (apiKey?: string): Promise<MoeStationData[]> => {
  const key = apiKey
    ?? (typeof process !== 'undefined' && (
      process.env.NEXT_PUBLIC_MOE_API_KEY ||
      process.env.EXPO_PUBLIC_MOE_API_KEY
    ));

  if (!key) {
    console.warn('[MOE] API key 未設定，跳過請求');
    return [];
  }

  const buildUrl = (station: string): string => {
    const base = 'https://data.moenv.gov.tw/api/v2/aqx_p_432';
    const params = new URLSearchParams({
      format: 'json',
      offset: '0',
      limit: '10',
      api_key: key as string,
    });
    params.append('filters', `SiteName,EQ,${station}`);
    return `${base}?${params.toString()}`;
  };

  try {
    const stationUrls = MOE_TARGET_STATIONS.map(buildUrl);
    const settledResponses = await Promise.allSettled(
      stationUrls.map(url =>
        fetch(url).then(async res => {
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`MOE API 錯誤 ${res.status}: ${errorText.slice(0, 200)}`);
          }
          return res.json();
        })
      )
    );

    let allRecords: any[] = [];
    settledResponses.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[MOE] 站點 ${MOE_TARGET_STATIONS[index]} 失敗:`, result.reason);
        return;
      }
      const r = result.value;
      if (Array.isArray(r)) {
        allRecords = allRecords.concat(r);
      } else if (r && r.records) {
        allRecords = allRecords.concat(r.records);
      }
    });

    return allRecords.map(record => ({
      sitename: record.sitename ?? '',
      aqi: Number(record.aqi) || 0,
      pm25: Number(record['pm2.5']) || 0,
      o3: Number(record.o3) || 0,
      no2: Number(record.no2) || 0,
      so2: Number(record.so2) || 0,
      co: Number(record.co) || 0,
      pm10: Number(record.pm10) || 0,
      datacreationdate: record.publishtime ?? undefined,
    }));
  } catch (err) {
    console.error('[MOE] 拉取資料失敗:', err);
    return [];
  }
};
