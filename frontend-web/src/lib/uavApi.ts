// UAV API client — uses the same /api proxy as the rest of the app

export interface FlightSummary {
  flight_id: string;
  site_name: string | null;
  flight_direction: string | null;
  data_level: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface ProfileRow {
  flight_id: string;
  site_name: string | null;
  agl_m: number;
  // PostgreSQL lowercases unquoted column names
  t:     number | null;
  rh:    number | null;
  p:     number | null;
  ws:    number | null;
  wd:    number | null;
  theta: number | null;
  pm1:   number | null;
  pm25:  number | null;
  pm10:  number | null;
  o3:    number | null;
  no2:   number | null;
  so2:   number | null;
  co:    number | null;
  co2:   number | null;
}

const BASE = '/api/uav';

export async function fetchFlights(): Promise<FlightSummary[]> {
  const res = await fetch(`${BASE}/flights`);
  if (!res.ok) throw new Error('無法取得飛行任務清單');
  return res.json();
}

export async function fetchProfile(flightId: string): Promise<ProfileRow[]> {
  const res = await fetch(`${BASE}/profile/${encodeURIComponent(flightId)}`);
  if (!res.ok) throw new Error(`無法取得 ${flightId} 的剖面資料`);
  return res.json();
}
