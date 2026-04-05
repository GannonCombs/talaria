import { NextRequest, NextResponse } from 'next/server';
import { getTransactions, logMppTransaction } from '@/lib/mpp';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const result = getTransactions({
    limit: Number(params.get('limit')) || 25,
    offset: Number(params.get('offset')) || 0,
    module: params.get('module') || undefined,
    service: params.get('service') || undefined,
    dateFrom: params.get('dateFrom') || undefined,
    dateTo: params.get('dateTo') || undefined,
    search: params.get('search') || undefined,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  logMppTransaction({
    service: body.service,
    module: body.module,
    endpoint: body.endpoint,
    rail: body.rail,
    costUsd: body.costUsd,
    metadata: body.metadata,
  });

  return NextResponse.json({ ok: true });
}
