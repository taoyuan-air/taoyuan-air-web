import { NextResponse } from 'next/server';
import { fetchMoeStations, MoeStationData } from '@shared/api/moe';

// ---- server-side cache ----
let cache: { data: MoeStationData[]; fetchedAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000; // 1 小時
// --------------------------

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return NextResponse.json(cache.data, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  const data = await fetchMoeStations();
  cache = { data, fetchedAt: now };

  return NextResponse.json(data, {
    headers: { 'X-Cache': 'MISS' },
  });
}