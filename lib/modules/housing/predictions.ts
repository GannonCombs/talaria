import { getDb } from '@/lib/db';

export interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
  source: string;
}

export async function fetchFedPredictions(): Promise<FedPrediction> {
  // Return cache if fresh (< 15 minutes)
  const cached = getCachedPrediction();
  if (cached) return cached;

  // Try Polymarket first, then Kalshi
  let prediction: FedPrediction | null = null;

  try {
    prediction = await fetchPolymarket();
  } catch {
    // Polymarket unavailable
  }

  if (!prediction) {
    try {
      prediction = await fetchKalshi();
    } catch {
      // Kalshi unavailable
    }
  }

  if (!prediction) {
    return { meetingDate: '', cutProb: 0, holdProb: 0, hikeProb: 0, source: 'unavailable' };
  }

  cachePrediction(prediction);
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
  const res = await fetch(
    'https://gamma-api.polymarket.com/markets?limit=100&closed=false&order=volume24hr&ascending=false',
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

    if (question.includes('no change')) {
      holdProb = yesPrice;
    } else if (question.includes('decrease') && question.includes('50')) {
      cutProb += yesPrice; // 50+ bps cut
    } else if (question.includes('decrease') && question.includes('25')) {
      cutProb += yesPrice; // 25 bps cut
    } else if (question.includes('increase')) {
      hikeProb = yesPrice;
    }
  }

  return { meetingDate, cutProb, holdProb, hikeProb, source: 'polymarket' };
}

// ── Kalshi (v2 API) ──

async function fetchKalshi(): Promise<FedPrediction> {
  const res = await fetch(
    'https://api.elections.kalshi.com/trade-api/v2/markets?series_ticker=KXFED&limit=20&status=open',
    { signal: AbortSignal.timeout(10000) }
  );

  if (!res.ok) throw new Error(`Kalshi ${res.status}`);

  const data = await res.json();
  const markets = data.markets ?? [];

  let holdProb = 0;
  let cutProb = 0;
  let hikeProb = 0;
  let meetingDate = '';

  for (const market of markets) {
    const title = (market.title ?? market.subtitle ?? '').toLowerCase();
    const price = market.last_price_dollars ?? market.yes_ask_dollars ?? 0;

    if (!meetingDate && market.close_time) {
      meetingDate = market.close_time.split('T')[0];
    }

    if (title.includes('no change') || title.includes('unchanged')) {
      holdProb = price;
    } else if (title.includes('cut') || title.includes('decrease') || title.includes('lower')) {
      cutProb += price;
    } else if (title.includes('hike') || title.includes('increase') || title.includes('raise')) {
      hikeProb = price;
    }
  }

  if (holdProb === 0 && cutProb === 0 && hikeProb === 0) {
    throw new Error('No Fed data parsed from Kalshi');
  }

  return { meetingDate, cutProb, holdProb, hikeProb, source: 'kalshi' };
}

// ── Cache ──

function getCachedPrediction(): FedPrediction | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM housing_fed_predictions
       WHERE fetched_at >= datetime('now', '-15 minutes')
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    meetingDate: row.meeting_date as string,
    cutProb: row.cut_prob as number,
    holdProb: row.hold_prob as number,
    hikeProb: row.hike_prob as number,
    source: row.source as string,
  };
}

function cachePrediction(pred: FedPrediction): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO housing_fed_predictions (date, meeting_date, cut_prob, hold_prob, hike_prob, source)
     VALUES (date('now'), ?, ?, ?, ?, ?)`
  ).run(pred.meetingDate, pred.cutProb, pred.holdProb, pred.hikeProb, pred.source);
}

export function getLatestPrediction(): FedPrediction | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM housing_fed_predictions
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    meetingDate: row.meeting_date as string,
    cutProb: row.cut_prob as number,
    holdProb: row.hold_prob as number,
    hikeProb: row.hike_prob as number,
    source: row.source as string,
  };
}
