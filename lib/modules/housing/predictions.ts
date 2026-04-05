import { getDb } from '@/lib/db';

export interface FedPrediction {
  meetingDate: string;
  cutProb: number;
  holdProb: number;
  hikeProb: number;
  source: string;
}

const MOCK_PREDICTION: FedPrediction = {
  meetingDate: '2026-05-07',
  cutProb: 0.62,
  holdProb: 0.35,
  hikeProb: 0.03,
  source: 'mock',
};

export async function fetchFedPredictions(): Promise<FedPrediction> {
  // Check cache (fresh if < 15 minutes old)
  const cached = getCachedPrediction();
  if (cached) return cached;

  let polymarketData: Partial<FedPrediction> | null = null;
  let kalshiData: Partial<FedPrediction> | null = null;

  // Try Polymarket
  try {
    polymarketData = await fetchPolymarket();
  } catch {
    // Polymarket unavailable
  }

  // Try Kalshi
  try {
    kalshiData = await fetchKalshi();
  } catch {
    // Kalshi unavailable
  }

  // Combine or fall back to mock
  let prediction: FedPrediction;

  if (polymarketData && kalshiData) {
    prediction = {
      meetingDate: polymarketData.meetingDate ?? kalshiData.meetingDate ?? MOCK_PREDICTION.meetingDate,
      cutProb: ((polymarketData.cutProb ?? 0) + (kalshiData.cutProb ?? 0)) / 2,
      holdProb: ((polymarketData.holdProb ?? 0) + (kalshiData.holdProb ?? 0)) / 2,
      hikeProb: ((polymarketData.hikeProb ?? 0) + (kalshiData.hikeProb ?? 0)) / 2,
      source: 'combined',
    };
  } else if (polymarketData) {
    prediction = {
      meetingDate: polymarketData.meetingDate ?? MOCK_PREDICTION.meetingDate,
      cutProb: polymarketData.cutProb ?? 0,
      holdProb: polymarketData.holdProb ?? 0,
      hikeProb: polymarketData.hikeProb ?? 0,
      source: 'polymarket',
    };
  } else if (kalshiData) {
    prediction = {
      meetingDate: kalshiData.meetingDate ?? MOCK_PREDICTION.meetingDate,
      cutProb: kalshiData.cutProb ?? 0,
      holdProb: kalshiData.holdProb ?? 0,
      hikeProb: kalshiData.hikeProb ?? 0,
      source: 'kalshi',
    };
  } else {
    prediction = MOCK_PREDICTION;
  }

  cachePrediction(prediction);
  return prediction;
}

async function fetchPolymarket(): Promise<Partial<FedPrediction>> {
  const res = await fetch(
    'https://clob.polymarket.com/markets?tag=fed-rates&limit=5',
    { signal: AbortSignal.timeout(8000) }
  );

  if (!res.ok) throw new Error(`Polymarket ${res.status}`);

  const data = await res.json();
  const markets = Array.isArray(data) ? data : data.data ?? [];

  // Find the next FOMC meeting market
  // Polymarket market structures vary — extract probability from the first relevant market
  for (const market of markets) {
    const question = (market.question ?? market.title ?? '').toLowerCase();
    if (question.includes('cut') || question.includes('fed') || question.includes('fomc')) {
      const prob = market.outcomePrices?.[0] ?? market.probability ?? null;
      if (prob !== null) {
        const cutProb = parseFloat(prob);
        return {
          meetingDate: market.endDate ?? MOCK_PREDICTION.meetingDate,
          cutProb: cutProb,
          holdProb: 1 - cutProb - 0.03,
          hikeProb: 0.03,
        };
      }
    }
  }

  throw new Error('No Fed market found on Polymarket');
}

async function fetchKalshi(): Promise<Partial<FedPrediction>> {
  const res = await fetch(
    'https://api.elections.kalshi.com/v1/events?series_ticker=FED&limit=5',
    { signal: AbortSignal.timeout(8000) }
  );

  if (!res.ok) throw new Error(`Kalshi ${res.status}`);

  const data = await res.json();
  const events = data.events ?? [];

  for (const event of events) {
    const markets = event.markets ?? [];
    for (const market of markets) {
      const title = (market.title ?? '').toLowerCase();
      if (title.includes('cut') || title.includes('lower')) {
        const prob = market.yes_ask ?? market.last_price ?? null;
        if (prob !== null) {
          return {
            meetingDate: event.end_date ?? MOCK_PREDICTION.meetingDate,
            cutProb: parseFloat(prob),
            holdProb: 1 - parseFloat(prob) - 0.03,
            hikeProb: 0.03,
          };
        }
      }
    }
  }

  throw new Error('No Fed event found on Kalshi');
}

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
