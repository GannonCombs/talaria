import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Read Finnhub API key from mpp-reseller/.env (same key, no cost — free tier)
function getFinnhubKey(): string {
  try {
    const envPath = path.join(process.cwd(), 'mpp-reseller', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/FINNHUB_API_KEY=(\S+)/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

// Map portfolio asset tickers to Finnhub symbol format
// Finnhub symbol mapping. Prefer COINBASE USD pairs (direct USD price).
const CRYPTO_SYMBOLS: Record<string, string> = {
  BTC: 'COINBASE:BTC-USD',
  ETH: 'COINBASE:ETH-USD',
  SOL: 'COINBASE:SOL-USD',
  ATOM: 'COINBASE:ATOM-USD',
  LINK: 'COINBASE:LINK-USD',
  UNI: 'COINBASE:UNI-USD',
  XLM: 'COINBASE:XLM-USD',
  AAVE: 'COINBASE:AAVE-USD',
  ALGO: 'COINBASE:ALGO-USD',
  COMP: 'COINBASE:COMP-USD',
  FIL: 'COINBASE:FIL-USD',
  GRT: 'COINBASE:GRT-USD',
  IMX: 'COINBASE:IMX-USD',
  LPT: 'COINBASE:LPT-USD',
  SNX: 'COINBASE:SNX-USD',
  ZRX: 'COINBASE:ZRX-USD',
  ICP: 'COINBASE:ICP-USD',
  RNDR: 'COINBASE:RENDER-USD',
  JTO: 'COINBASE:JTO-USD',
  POL: 'COINBASE:POL-USD',
  ALCX: 'COINBASE:ALCX-USD',
  CGLD: 'COINBASE:CGLD-USD',
  FORTH: 'COINBASE:FORTH-USD',
  OXT: 'COINBASE:OXT-USD',
  RARI: 'COINBASE:RARI-USD',
  UMA: 'COINBASE:UMA-USD',
  MIR: 'KRAKEN:MIRUSD',
};

const STABLECOINS = new Set(['USD', 'USDC', 'USDT']);

async function fetchPrice(symbol: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.c;
    return typeof price === 'number' && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// GET /api/portfolio/prices?assets=BTC,ETH,ATOM,...
export async function GET(request: NextRequest) {
  const assetsParam = request.nextUrl.searchParams.get('assets') ?? '';
  const assets = assetsParam.split(',').map((a) => a.trim()).filter(Boolean);

  if (assets.length === 0) {
    return NextResponse.json({ prices: {} });
  }

  const apiKey = getFinnhubKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Finnhub API key not found in mpp-reseller/.env' },
      { status: 500 }
    );
  }

  const prices: Record<string, number> = {};

  // Stablecoins = $1.00, no API call needed
  const toFetch: Array<{ asset: string; symbol: string }> = [];
  for (const asset of assets) {
    if (STABLECOINS.has(asset)) {
      prices[asset] = 1.0;
    } else {
      const symbol = CRYPTO_SYMBOLS[asset] ?? asset; // try as equity if not in crypto map
      toFetch.push({ asset, symbol });
    }
  }

  // Fetch all prices in parallel
  const results = await Promise.allSettled(
    toFetch.map(async ({ asset, symbol }) => {
      const price = await fetchPrice(symbol, apiKey);
      return { asset, price };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.price !== null) {
      prices[result.value.asset] = result.value.price;
    }
  }

  return NextResponse.json({ prices });
}
