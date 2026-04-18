import { dbGet, dbRun } from '@/lib/db';

export interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
  source: string;
}

export async function fetchFedPredictions(): Promise<FedPrediction> {
  // Return cache if fresh (< 15 minutes)
  const cached = await getCachedPrediction();
  if (cached) return cached;

  // Try Kalshi first (structured ticker data, more reliable), then Polymarket
  let prediction: FedPrediction | null = null;

  try {
    prediction = await fetchKalshi();
  } catch {
    // Kalshi unavailable
  }

  if (!prediction) {
    try {
      prediction = await fetchPolymarket();
    } catch {
      // Polymarket unavailable
    }
  }

  if (!prediction) {
    return { meetingDate: '', cutProb: 0, holdProb: 0, hikeProb: 0, source: 'unavailable' };
  }

  await cachePrediction(prediction);
  return prediction;
}

// ── Polymarket (Gamma API) ──
// Fetches all Fed rate markets for the next FOMC meeting and combines probabilities.
// Markets: "no change", "25 bps cut", "50+ bps cut", "25+ bps hike"

interface GammaMarket {
  id: string;
  question: string;
  outcomePrices: string; // JSON string: ["yes_price", "no_price"]
  endDate: string;
}

async function fetchPolymarket(): Promise<FedPrediction> {
  // limit=500: the "no change" market is often outside the top 100 by
  // volume, which caused holdProb to silently stay at 0.
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?limit=500&closed=false&order=volume24hr&ascending=false',
    { signal: AbortSignal.timeout(10000) }
  );

  if (!res.ok) throw new Error(`Polymarket ${res.status}`);

  const markets: GammaMarket[] = await res.json();

  // Find Fed interest rate markets
  const fedMarkets = markets.filter(
    (m) => m.question.includes('Fed') && m.question.includes('interest')
  );

  if (fedMarkets.length === 0) throw new Error('No Fed markets found');

  // Parse probabilities from each market
  let holdProb = 0;
  let cutProb = 0;
  let hikeProb = 0;
  let meetingDate = '';

  for (const market of fedMarkets) {
    const prices = JSON.parse(market.outcomePrices);
    const yesPrice = parseFloat(prices[0]);
    const question = market.question.toLowerCase();

    if (!meetingDate && market.endDate) {
      meetingDate = market.endDate.split('T')[0];
    }

    if (question.includes('no change') || question.includes('unchanged') || question.includes('hold')) {
      holdProb = yesPrice;
    } else if (question.includes('decrease') && question.includes('50')) {
      cutProb += yesPrice; // 50+ bps cut
    } else if (question.includes('decrease') && question.includes('25')) {
      cutProb += yesPrice; // 25 bps cut
    } else if (question.includes('increase')) {
      hikeProb = yesPrice;
    }
  }

  // Safety net: derive hold as residual if no explicit hold market was found
  if (holdProb === 0 && (cutProb > 0 || hikeProb > 0)) {
    holdProb = Math.max(0, 1 - cutProb - hikeProb);
  }

  return { meetingDate, cutProb, holdProb, hikeProb, source: 'polymarket' };
}

// ── Kalshi (v2 API, KXFEDDECISION series) ──
//
// The KXFEDDECISION series has 5 markets per FOMC meeting with structured
// ticker suffixes:
//   -H0  = "Hike by 0bps"  → HOLD
//   -H25 = "Hike by 25bps" → HIKE (25 bps)
//   -H26 = "Hike by >25bps" → HIKE (50+ bps)
//   -C25 = "Cut by 25bps"  → CUT (25 bps)
//   -C26 = "Cut by >25bps" → CUT (50+ bps)
//
// We filter to the nearest meeting (earliest close_time) and parse by
// ticker suffix rather than question text — much more reliable.

async function fetchKalshi(): Promise<FedPrediction> {
  const res = await fetch(
    'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFEDDECISION&limit=100&status=open',
    { signal: AbortSignal.timeout(10000) }
  );

  if (!res.ok) throw new Error(`Kalshi ${res.status}`);

  const data = await res.json();
  const markets: Array<{
    ticker?: string;
    close_time?: string;
    last_price_dollars?: number;
    yes_ask_dollars?: number;
  }> = data.markets ?? [];

  if (markets.length === 0) throw new Error('No KXFEDDECISION markets');

  // Find the earliest close_time — that's the next FOMC meeting
  const sorted = [...markets]
    .filter((m) => m.close_time)
    .sort((a, b) => a.close_time!.localeCompare(b.close_time!));

  if (sorted.length === 0) throw new Error('No KXFEDDECISION markets with close_time');

  const nextMeetingClose = sorted[0].close_time!.split('T')[0];
  const meetingDate = nextMeetingClose;

  // Filter to only that meeting's markets
  const meetingMarkets = sorted.filter(
    (m) => m.close_time!.startsWith(nextMeetingClose)
  );

  let holdProb = 0;
  let cutProb = 0;
  let hikeProb = 0;

  for (const market of meetingMarkets) {
    const ticker = market.ticker ?? '';
    // Kalshi returns prices as strings (e.g., "0.0100") — parseFloat to
    // avoid string concatenation.
    const price = parseFloat(String(market.last_price_dollars ?? market.yes_ask_dollars ?? 0));

    // Use only the three core markets: hold (H0), cut 25bps (C25), hike
    // 25bps (H25). The >25bps long-tail brackets (C26, H26) add overround
    // that pushes the sum past 100%. The three main bets track very close
    // to 100% on their own.
    if (ticker.endsWith('-H0')) {
      holdProb = price;
    } else if (ticker.endsWith('-H25')) {
      hikeProb = price;
    } else if (ticker.endsWith('-C25')) {
      cutProb = price;
    }
  }

  if (holdProb === 0 && cutProb === 0 && hikeProb === 0) {
    throw new Error('No Fed data parsed from Kalshi KXFEDDECISION');
  }

  // Safety net: derive hold as residual if the H0 market was missing
  if (holdProb === 0 && (cutProb > 0 || hikeProb > 0)) {
    holdProb = Math.max(0, 1 - cutProb - hikeProb);
  }

  return { meetingDate, cutProb, holdProb, hikeProb, source: 'kalshi' };
}

// ── Cache ──

async function getCachedPrediction(): Promise<FedPrediction | null> {
  const row = await dbGet<Record<string, unknown>>(
    `SELECT * FROM housing_fed_predictions
     WHERE fetched_at >= datetime('now', '-15 minutes')
     ORDER BY fetched_at DESC LIMIT 1`
  );

  if (!row) return null;

  return {
    meetingDate: row.meeting_date as string,
    cutProb: row.cut_prob as number,
    holdProb: row.hold_prob as number,
    hikeProb: row.hike_prob as number,
    source: row.source as string,
  };
}

async function cachePrediction(pred: FedPrediction): Promise<void> {
  await dbRun(
    `INSERT INTO housing_fed_predictions (date, meeting_date, cut_prob, hold_prob, hike_prob, source)
     VALUES (date('now'), ?, ?, ?, ?, ?)`,
    pred.meetingDate, pred.cutProb, pred.holdProb, pred.hikeProb, pred.source
  );
}

export async function getLatestPrediction(): Promise<FedPrediction | null> {
  const row = await dbGet<Record<string, unknown>>(
    `SELECT * FROM housing_fed_predictions
     ORDER BY fetched_at DESC LIMIT 1`
  );

  if (!row) return null;

  return {
    meetingDate: row.meeting_date as string,
    cutProb: row.cut_prob as number,
    holdProb: row.hold_prob as number,
    hikeProb: row.hike_prob as number,
    source: row.source as string,
  };
}
