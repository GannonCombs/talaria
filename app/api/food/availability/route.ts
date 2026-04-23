import { NextRequest, NextResponse } from 'next/server';
import { getAvailability } from '@/lib/modules/food/resy-client';

// GET: Check availability for a venue on a date with party size.
// Query: ?venue_id=123&date=2026-04-21&party_size=2
// Direct Resy API — free, no MPP cost.
export async function GET(request: NextRequest) {
  const venueId = Number(request.nextUrl.searchParams.get('venue_id'));
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().split('T')[0];
  const partySize = Number(request.nextUrl.searchParams.get('party_size') ?? 2);

  if (!venueId) {
    return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
  }

  try {
    const slots = await getAvailability({ venueId, date, partySize });
    return NextResponse.json({ venueId, date, partySize, slots });
  } catch (err) {
    console.error('[food/availability] error:', err);
    return NextResponse.json(
      { error: (err as Error).message, slots: [] },
      { status: 502 }
    );
  }
}

export const maxDuration = 120;
