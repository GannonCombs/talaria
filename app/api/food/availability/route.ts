import { NextRequest, NextResponse } from 'next/server';
import { paidFetch, SpendLimitError, ApprovalDeniedError } from '@/lib/mpp-client';

const RESELLER_URL = 'http://127.0.0.1:8787/resy/availability';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const venueId = params.get('venue_id');
  const lat = params.get('lat') ?? '30.2672';
  const long = params.get('long') ?? '-97.7431';
  const day = params.get('day') ?? new Date().toISOString().split('T')[0];
  const partySize = params.get('party_size') ?? '2';

  if (!venueId) {
    return NextResponse.json({ error: 'venue_id is required' }, { status: 400 });
  }

  const url = `${RESELLER_URL}?venue_id=${venueId}&day=${day}&party_size=${partySize}`;

  try {
    const res = await paidFetch(url, undefined, {
      service: 'Resy',
      module: 'food',
      endpoint: '/resy/availability',
      estimatedCost: 0.001,
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Resy returned ${res.status}`, detail: text }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SpendLimitError) {
      return NextResponse.json({ error: err.message, errors: err.errors }, { status: 429 });
    }
    if (err instanceof ApprovalDeniedError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'Resy availability failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export const maxDuration = 120;
