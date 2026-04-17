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

// ── Hiive (private company pricing — SpaceX, etc.) ──────────────────────

function getHiiveToken(): string {
  try {
    const envPath = path.join(process.cwd(), 'mpp-reseller', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const match = content.match(/HIIVE_TOKEN=(\S+)/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

// Tickers that should be priced via Hiive (private companies).
// Value is the search term used to find the company on Hiive.
const HIIVE_TICKERS: Record<string, string> = {
  RAMP: 'Ramp',
};

// Cache company ID lookups (company name → UUID)
const hiiveCompanyIdCache = new Map<string, string>();

async function searchHiiveCompany(searchText: string, token: string): Promise<string | null> {
  if (hiiveCompanyIdCache.has(searchText)) return hiiveCompanyIdCache.get(searchText)!;

  try {
    const res = await fetch('https://api.hiive.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://app.hiive.com',
        'Referer': 'https://app.hiive.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        operationName: 'companiesSearchListCompanies',
        query: `query companiesSearchListCompanies($orderBy: ListCompaniesOrderBy!, $first: Int!, $searchText: String, $statuses: [CompanyStatus!]) {
          listCompanies(orderBy: $orderBy, first: $first, searchText: $searchText, statuses: $statuses) {
            edges { node { id name __typename } __typename }
            __typename
          }
        }`,
        variables: { first: 1, orderBy: 'MARKET_ACTIVITY', searchText, statuses: ['LISTED'] },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.data?.listCompanies?.edges?.[0]?.node?.id ?? null;
    if (id) hiiveCompanyIdCache.set(searchText, id);
    return id;
  } catch {
    return null;
  }
}

async function fetchHiivePrice(companyId: string, token: string): Promise<number | null> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // last 30 days
    const res = await fetch('https://api.hiive.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Origin': 'https://app.hiive.com',
        'Referer': 'https://app.hiive.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        operationName: 'basicTraderCompanyPriceData',
        query: `query basicTraderCompanyPriceData($companyId: ID!, $startDate: Date!, $indicators: [Indicator]!) {
          companyPriceDataV2(companyId: $companyId, startDate: $startDate, indicators: $indicators) {
            dailyPriceData { day indexPrice __typename }
            indexPriceTrends { currentPrice trendName changePercentage __typename }
            __typename
          }
        }`,
        variables: {
          companyId,
          startDate: startDate.toISOString().split('T')[0],
          indicators: ['INDEX_PRICE'],
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    // Try indexPriceTrends first (has currentPrice directly)
    const trends = data?.data?.companyPriceDataV2?.indexPriceTrends;
    if (Array.isArray(trends) && trends.length > 0) {
      const current = trends.find((t: { trendName: string }) => t.trendName === '1M') ?? trends[0];
      if (current?.currentPrice) {
        return current.currentPrice / 100; // cents → dollars
      }
    }

    // Fall back to last dailyPriceData entry
    const daily = data?.data?.companyPriceDataV2?.dailyPriceData;
    if (Array.isArray(daily) && daily.length > 0) {
      const last = daily[daily.length - 1];
      if (last?.indexPrice) {
        return last.indexPrice / 100; // cents → dollars
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchHiivePrices(tickers: string[]): Promise<Record<string, number>> {
  const token = getHiiveToken();
  if (!token) return {};

  const prices: Record<string, number> = {};

  for (const ticker of tickers) {
    const searchTerm = HIIVE_TICKERS[ticker];
    if (!searchTerm) continue;

    const companyId = await searchHiiveCompany(searchTerm, token);
    if (!companyId) continue;

    const price = await fetchHiivePrice(companyId, token);
    if (price !== null) {
      prices[ticker] = price;
    }
  }

  return prices;
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
  const hiiveTickers: string[] = [];

  for (const asset of assets) {
    if (STABLECOINS.has(asset)) {
      prices[asset] = 1.0;
      dailyPcts[asset] = 0;
    } else if (HIIVE_TICKERS[asset]) {
      hiiveTickers.push(asset);
    } else if (ETF_FINNHUB_SYMBOLS[asset]) {
      equityTickers.push(asset);
    } else if (COINGECKO_IDS[asset]) {
      cryptoTickers.push(asset);
    } else {
      equityTickers.push(asset);
    }
  }

  // Fetch all price sources simultaneously
  const apiKey = getFinnhubKey();

  const [cgResult, hiiveResult, ...finnhubResults] = await Promise.allSettled([
    fetchCoinGeckoPrices(cryptoTickers),
    fetchHiivePrices(hiiveTickers),
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

  // Merge Hiive results
  if (hiiveResult.status === 'fulfilled') {
    Object.assign(prices, hiiveResult.value);
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
