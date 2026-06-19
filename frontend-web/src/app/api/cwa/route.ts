import { NextRequest, NextResponse } from 'next/server';
import { fetchCwaWeather } from '@shared/api/cwa';

export async function GET(req: NextRequest) {
  const district = req.nextUrl.searchParams.get('district') ?? '中壢區';
  const data = await fetchCwaWeather(district, process.env.NEXT_PUBLIC_CWA_API_KEY);
  return NextResponse.json(data);
}