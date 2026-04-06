import { NextRequest, NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/modules/housing/mapbox';

export async function POST(request: NextRequest) {
  const { address } = await request.json();

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 });
  }

  const result = await geocodeAddress(address);

  if (!result) {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 404 });
  }

  return NextResponse.json(result);
}
