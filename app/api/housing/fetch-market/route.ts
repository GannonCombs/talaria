import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logMppTransaction } from '@/lib/mpp';
import { spawnSync } from 'child_process';
import path from 'path';

// Path to the installed agentcash CLI bin. Computed from process.cwd() at
// runtime — Turbopack rewrites `require.resolve` for externals into a fake
// `[externals]` placeholder string, so we deliberately avoid it. The Next.js
// dev/prod server always runs from the project root.
const agentcashCli = path.join(
  process.cwd(),
  'node_modules',
  'agentcash',
  'dist',
  'esm',
  'index.js'
);

export async function POST(request: NextRequest) {
  const { zipCode } = await request.json();

  if (!zipCode) {
    return NextResponse.json({ error: 'zipCode is required' }, { status: 400 });
  }

  // Check cache first (stale after 7 days)
  const db = getDb();
  const cached = db
    .prepare(
      `SELECT * FROM housing_market_stats
       WHERE zip = ? AND fetched_at >= datetime('now', '-7 days')
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get(zipCode) as Record<string, unknown> | undefined;

  if (cached) {
    return NextResponse.json({
      source: 'cache',
      data: {
        zip: cached.zip,
        medianPrice: cached.median_price,
        medianPpsf: cached.median_ppsf,
        activeListings: cached.active_listings,
        soldCount: cached.sold_count,
        medianDom: cached.median_dom,
      },
    });
  }

  // Make the real MPP call via AgentCash. Spawn `node` directly on the
  // installed CLI bin so the JSON body is passed as a literal argv arg —
  // no shell, no .cmd shim. First call is slow (~10s) because of wallet
  // load + 402 round trip + payment + retry, so allow 2 minutes.
  try {
    const result = spawnSync(
      process.execPath,
      [
        agentcashCli,
        'fetch',
        'https://rentcast.mpp.paywithlocus.com/rentcast/markets',
        '-m', 'POST',
        '-b', JSON.stringify({ zipCode }),
        '--format', 'json',
      ],
      { timeout: 120000, shell: false, encoding: 'utf8' }
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`agentcash exited ${result.status}: ${result.stderr || result.stdout}`);
    }

    const parsed = JSON.parse(result.stdout);
    if (parsed.success === false) {
      throw new Error(`agentcash error: ${JSON.stringify(parsed.error)}`);
    }
    const data = parsed.data?.data || parsed.data || parsed;

    // Extract the sale data
    const saleData = data.saleData || data;

    // Store in DB
    db.prepare(
      `INSERT OR REPLACE INTO housing_market_stats
       (zip, date, median_price, median_ppsf, active_listings, sold_count, median_dom)
       VALUES (?, date('now'), ?, ?, ?, ?, ?)`
    ).run(
      zipCode,
      saleData.medianPrice ?? null,
      saleData.medianPricePerSquareFoot ?? null,
      saleData.totalListings ?? null,
      saleData.soldCount ?? null,
      saleData.medianDaysOnMarket ?? null
    );

    // Log the transaction
    logMppTransaction({
      service: 'RentCast',
      module: 'housing',
      endpoint: '/rentcast/markets',
      rail: 'tempo',
      costUsd: 0.033,
      metadata: { via: 'usdc', zipCode },
    });

    return NextResponse.json({
      source: 'rentcast',
      cost: 0.033,
      data: saleData,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: 'RentCast call failed', detail: message }, { status: 500 });
  }
}
