const EPA_TARGET_STATIONS = [
  '中壢',
  '桃園',
  '大園',
  '觀音',
  '平鎮',
  '龍潭',
];

export interface EpaStationData {
  sitename: string;
  aqi: number;
  pm25: number;
  o3: number;
  nox: number;
  datacreationdate?: string;
}

// 取得 EPA 目標測站的即時空氣品質資料。
export const fetchEpaStations = async (): Promise<EpaStationData[]> => {
  const apiKey = process.env.EXPO_PUBLIC_EPA_API_KEY;
  if (!apiKey) {
    console.warn('[EPA] EXPO_PUBLIC_EPA_API_KEY 未設定，跳過 API 請求');
    return [];
  }

  // 單一站點的請求
  const buildUrl = (station: string): string => {
    const base = 'https://data.moenv.gov.tw/api/v2/aqx_p_432';
    const params = new URLSearchParams({
      format: 'json',
      offset: '0',
      limit: '10',
      api_key: apiKey,
    });
    // 只給一個 filters 參數 → API 會當作 OR（單一條件）來匹配
    params.append('filters', `SiteName,EQ,${station}`);
    return `${base}?${params.toString()}`;
  };

  try {
    // 針對每個站點發出請求，並同時等待全部完成
    const stationUrls = EPA_TARGET_STATIONS.map(buildUrl);
    const settledResponses = await Promise.allSettled(
      stationUrls.map(url =>
        fetch(url).then(async res => {
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`EPA API 錯誤 ${res.status} ${res.statusText}: ${errorText.slice(0, 200)}`);
          }
          return res.json();
        })
      )
    );

    // 合併所有回應的 records
    let allRecords: any[] = [];
    settledResponses.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[EPA] 站點 ${EPA_TARGET_STATIONS[index]} 請求失敗:`, result.reason);
        return;
      }
    const r = result.value;
      if (Array.isArray(r)) {
        allRecords = allRecords.concat(r);
      } else if (r && r.records) {
        allRecords = allRecords.concat(r.records);
      } else {
        console.warn(`[EPA] 站點 ${EPA_TARGET_STATIONS[index]} 回應格式異常:`, r);
      }
    });

    // 合併所有回應的 records（修正：API 直接回傳陣列，不是 { records: [...] }）

    

    console.log('[EPA] 收到的 records (總筆數):', allRecords.length);

    // 轉換成介面所需的型別
    return allRecords.map(record => ({
      sitename: record.sitename ?? '',
      aqi: Number(record.aqi) || 0,
      pm25: Number(record['pm2.5']) || 0,
      o3: Number(record.o3) || 0,
      nox: Number(record.nox) || 0,
      datacreationdate: record.publishtime ?? undefined,
    }));
  } catch (err) {
    console.error('[EPA] 拉取資料失敗:', err);
    // 依照需求決定要拋錯還是回傳空陣列；這裡選擇回傳空陣列以免 UI 因例外而掛掉
    return [];
  }
};