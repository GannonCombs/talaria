import { NextRequest, NextResponse } from 'next/server';
import { paidFetch, SpendLimitError, ApprovalDeniedError } from '@/lib/mpp-client';

const RESELLER_URL = 'http://127.0.0.1:8787/quote';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? 'AAPL';

  try {
    const res = await paidFetch(
      `${RESELLER_URL}?symbol=${encodeURIComponent(symbol)}`,
      undefined,
      { service: 'Finnhub', module: 'portfolio', endpoint: '/quote', estimatedCost: 0.001 },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Finnhub returned ${res.status}`, detail: text }, { status: 502 });
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
      { error: 'Quote fetch failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}

export const maxDuration = 120; // Touch ID may take a while
