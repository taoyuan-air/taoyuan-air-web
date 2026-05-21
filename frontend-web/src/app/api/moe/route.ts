import { NextResponse } from 'next/server';
import { fetchMoeStations } from '@shared/api/moe';

export async function GET() {
  const stations = await fetchMoeStations();
  return NextResponse.json(stations, {
    headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
  });
}
