import { NextRequest, NextResponse } from 'next/server';
import { fetchIsochrone } from '@/lib/modules/housing/mapbox';

export async function POST(request: NextRequest) {
  const { lat, lng, minutes, mode } = await request.json();

  if (!lat || !lng) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  const result = await fetchIsochrone(lat, lng, minutes ?? 30, mode ?? 'auto');

  if (!result) {
    return NextResponse.json({ error: 'Isochrone computation failed' }, { status: 500 });
  }

  return NextResponse.json(result);
}
