import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ── Finnhub (equities, ETFs, mutual funds) ──────────────────────────────

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

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<{ price: number | null; dailyPct: number | null }> {
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { price: null, dailyPct: null };
    const data = await res.json();
    const price = typeof data?.c === 'number' && data.c > 0 ? data.c : null;
    const dailyPct = typeof data?.dp === 'number' ? data.dp : null;
    return { price, dailyPct };
  } catch {
    return { price: null, dailyPct: null };
  }
}

// ── CoinGecko (crypto — single batch call, free, no key) ────────────────

// Map portfolio ticker → CoinGecko id
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  ATOM: 'cosmos',
  LINK: 'chainlink',
  UNI: 'uniswap',
  XLM: 'stellar',
  AAVE: 'aave',
  ALGO: 'algorand',
  COMP: 'compound-governance-token',
  FIL: 'filecoin',
  GRT: 'the-graph',
  IMX: 'immutable-x',
  LPT: 'livepeer',
  SNX: 'synthetix-network-token',
  ZRX: '0x-protocol',
  ICP: 'internet-computer',
  RNDR: 'render-token',
  JTO: 'jito-governance-token',
  POL: 'polygon-ecosystem-token',
  ALCX: 'alchemix',
  CGLD: 'celo',
  FORTH: 'ampleforth-governance-token',
  MIR: 'mirror-protocol',
  OXT: 'orchid-protocol',
  RARI: 'rari-governance-token',
  UMA: 'uma',
  NU: 'nucypher',
};

async function fetchCoinGeckoPrices(tickers: string[]): Promise<{
  prices: Record<string, number>;
  dailyPcts: Record<string, number>;
}> {
  const ids: string[] = [];
  const tickerToId = new Map<string, string>();

  for (const ticker of tickers) {
    const id = COINGECKO_IDS[ticker];
    if (id) {
      ids.push(id);
      tickerToId.set(id, ticker);
    }
  }

  if (ids.length === 0) return { prices: {}, dailyPcts: {} };

  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { prices: {}, dailyPcts: {} };
    const data = await res.json();

    const prices: Record<string, number> = {};
    const dailyPcts: Record<string, number> = {};

    for (const [id, values] of Object.entries(data)) {
      const ticker = tickerToId.get(id);
      if (!ticker) continue;
      const v = values as { usd?: number; usd_24h_change?: number | null };
      if (typeof v.usd === 'number' && v.usd > 0) {
        prices[ticker] = v.usd;
      }
      if (typeof v.usd_24h_change === 'number') {
        dailyPcts[ticker] = v.usd_24h_change;
      }
    }

    return { prices, dailyPcts };
  } catch {
    return { prices: {}, dailyPcts: {} };
  }
}

// ── Route ───────────────────────────────────────────────────────────────

const STABLECOINS = new Set(['USD', 'USDC', 'USDT']);

// Renamed ETF tickers that collide with crypto (from Fidelity parser).
// Map back to the Finnhub equity symbol for pricing.
const ETF_FINNHUB_SYMBOLS: Record<string, string> = {
  'BTC-ETF': 'BTC',   // Grayscale Bitcoin Mini Trust ETF
  'ETH-ETF': 'ETH',   // Grayscale Ethereum Staking Mini ETF
};

// GET /api/portfolio/prices?assets=BTC,ETH,NVDA,...
export async function GET(request: NextRequest) {
  const assetsParam = request.nextUrl.searchParams.get('assets') ?? '';
  const assets = assetsParam.split(',').map((a) => a.trim()).filter(Boolean);

  if (assets.length === 0) {
    return NextResponse.json({ prices: {}, dailyPcts: {} });
  }

  const prices: Record<string, number> = {};
  const dailyPcts: Record<string, number> = {};

  // Stablecoins
  const cryptoTickers: string[] = [];
  const equityTickers: string[] = [];

  for (const asset of assets) {
    if (STABLECOINS.has(asset)) {
      prices[asset] = 1.0;
      dailyPcts[asset] = 0;
    } else if (ETF_FINNHUB_SYMBOLS[asset]) {
      // Renamed ETF ticker — route to Finnhub with the original equity symbol
      equityTickers.push(asset);
    } else if (COINGECKO_IDS[asset]) {
      cryptoTickers.push(asset);
    } else {
      equityTickers.push(asset);
    }
  }

  // Fetch crypto (CoinGecko — one batch call) and equities (Finnhub — parallel) simultaneously
  const apiKey = getFinnhubKey();

  const [cgResult, ...finnhubResults] = await Promise.allSettled([
    fetchCoinGeckoPrices(cryptoTickers),
    ...equityTickers.map(async (ticker) => {
      if (!apiKey) return { ticker, price: null, dailyPct: null };
      const finnhubSymbol = ETF_FINNHUB_SYMBOLS[ticker] ?? ticker;
      const quote = await fetchFinnhubQuote(finnhubSymbol, apiKey);
      return { ticker, ...quote };
    }),
  ]);

  // Merge CoinGecko results
  if (cgResult.status === 'fulfilled') {
    Object.assign(prices, cgResult.value.prices);
    Object.assign(dailyPcts, cgResult.value.dailyPcts);
  }

  // Merge Finnhub results
  for (const result of finnhubResults) {
    if (result.status === 'fulfilled') {
      const { ticker, price, dailyPct } = result.value as { ticker: string; price: number | null; dailyPct: number | null };
      if (price !== null) prices[ticker] = price;
      if (dailyPct !== null) dailyPcts[ticker] = dailyPct;
    }
  }

  return NextResponse.json({ prices, dailyPcts });
}
