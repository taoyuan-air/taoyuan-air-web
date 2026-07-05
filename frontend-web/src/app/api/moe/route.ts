import { NextResponse } from 'next/server';
import { fetchMoeStations, type MoeStationData } from '@shared/api/moe';

interface MoeApiResponse {
  data: MoeStationData[];
  isFallback: boolean;
}

let cache: { response: MoeApiResponse; fetchedAt: number } | null = null;
const TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < TTL_MS) {
    return NextResponse.json(cache.response, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  const apiKey = process.env.NEXT_PUBLIC_MOE_API_KEY;
  const data = await fetchMoeStations(apiKey);
  const response: MoeApiResponse = {
    data,
    isFallback: !apiKey || data.length === 0,
  };
  cache = { response, fetchedAt: now };

  return NextResponse.json(response, {
    headers: { 'X-Cache': 'MISS' },
  });
}
