import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketStats } from '@/lib/modules/housing/rentcast';

export async function GET(request: NextRequest) {
  const zip = request.nextUrl.searchParams.get('zip');

  if (!zip) {
    return NextResponse.json({ error: 'zip parameter required' }, { status: 400 });
  }

  const stats = await fetchMarketStats(zip);

  if (!stats) {
    return NextResponse.json({ error: 'No market data found' }, { status: 404 });
  }

  return NextResponse.json(stats);
}
