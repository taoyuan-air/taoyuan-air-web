import { NextRequest, NextResponse } from 'next/server';
import { fetchCwaWeather, type CwaWeatherBundle } from '@shared/api/cwa';

interface CwaApiResponse {
  data: CwaWeatherBundle;
  isFallback: boolean;
}

const cache = new Map<string, { response: CwaApiResponse; fetchedAt: number }>();
const TTL_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get('district') ?? '中壢區';
  const now = Date.now();
  const cached = cache.get(district);

  if (cached && now - cached.fetchedAt < TTL_MS) {
    return NextResponse.json(cached.response, {
      headers: { 'X-Cache': 'HIT' },
    });
  }

  const apiKey = process.env.NEXT_PUBLIC_CWA_API_KEY;
  const data = await fetchCwaWeather(district, apiKey);
  const response: CwaApiResponse = {
    data,
    isFallback: data.usedFallback ?? !apiKey,
  };
  cache.set(district, { response, fetchedAt: now });

  return NextResponse.json(response, {
    headers: { 'X-Cache': 'MISS' },
  });
}
