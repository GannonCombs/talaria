import { NextRequest, NextResponse } from 'next/server';
import { fetchListings } from '@/lib/modules/housing/rentcast';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const zip = params.get('zip');

  if (!zip) {
    return NextResponse.json({ error: 'zip parameter required' }, { status: 400 });
  }

  const listings = await fetchListings(zip, {
    minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
    maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    minBeds: params.get('minBeds') ? Number(params.get('minBeds')) : undefined,
    minSqft: params.get('minSqft') ? Number(params.get('minSqft')) : undefined,
    maxDom: params.get('maxDom') ? Number(params.get('maxDom')) : undefined,
  });

  return NextResponse.json(listings);
}
