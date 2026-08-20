// Wind Lidar API client — 與 uavApi.ts 使用相同的 /api proxy 模式

export type PanelKey = 'wind_speed' | 'wind_direction' | 'turbulence' | 'cnr';

export interface StationInfo {
  station: string;
  dates: string[];   // YYYY-MM-DD，降冪排序（最新在前）
}

export interface PanelData {
  z: (number | null)[][];   // z[heightIdx][timeIdx]，null = 透明
  unit: string;
  colorMin: number;
  colorMax: number;
}

export interface PlotData {
  station: string;
  timezone: string;
  heightsKm: number[];    // 升冪，單位公里
  times: string[];        // 'YYYY-MM-DD HH:MM' 格式，台灣本地時間
  panels: {
    wind_speed:     PanelData;
    wind_direction: PanelData;
    turbulence:     PanelData;
    cnr:            PanelData;
  };
  warnings: string[];
}

const BASE = '/api/wind-lidar';

export async function fetchStations(): Promise<StationInfo[]> {
  const res = await fetch(`${BASE}/stations`);
  if (!res.ok) throw new Error(`無法取得風光達測站清單（HTTP ${res.status}）`);
  return res.json();
}

export async function fetchPlotData(
  station: string,
  date: string,
  heightMax: number,
  panels?: PanelKey[],
): Promise<PlotData> {
  const params = new URLSearchParams({
    station,
    date,
    heightMax: String(heightMax),
  });
  if (panels && panels.length > 0) {
    params.set('panels', panels.join(','));
  }

  const res = await fetch(`${BASE}/plot-data?${params.toString()}`);

  if (res.status === 404) {
    throw new Error('所選日期無資料');
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore
    }
    throw new Error(`取得風光達資料失敗：${detail}`);
  }

  return res.json();
}
