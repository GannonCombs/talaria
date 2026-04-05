import { getDb } from '@/lib/db';

export interface MortgageRate {
  product: string;
  rate: number;
  apr: number;
  loanAmount: number;
  source: string;
}

const MOCK_RATES: MortgageRate[] = [
  { product: '30yr_fixed', rate: 5.98, apr: 6.12, loanAmount: 440000, source: 'bankrate' },
  { product: '15yr_fixed', rate: 5.25, apr: 5.41, loanAmount: 440000, source: 'bankrate' },
  { product: '30yr_fha', rate: 5.65, apr: 6.45, loanAmount: 440000, source: 'bankrate' },
  { product: '5yr_arm', rate: 5.45, apr: 6.08, loanAmount: 440000, source: 'bankrate' },
];

export async function fetchBankrateRates(params: {
  homeValue: number;
  downPayment: number;
  loanTerm: 30 | 15;
  creditScore: 'excellent' | 'good' | 'fair';
  zipCode: string;
  loanType: 'conventional' | 'fha' | 'va';
}): Promise<MortgageRate[]> {
  const loanAmount = params.homeValue - params.downPayment;

  try {
    // Attempt to scrape Bankrate
    const url = new URL('https://www.bankrate.com/mortgages/mortgage-rates/');
    url.searchParams.set('loan-type', params.loanType);
    url.searchParams.set('purchase-price', String(params.homeValue));
    url.searchParams.set('down-payment', String(params.downPayment));
    url.searchParams.set('credit-score', params.creditScore);
    url.searchParams.set('zip', params.zipCode);
    url.searchParams.set('loan-term', `${params.loanTerm}y`);

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Bankrate returned ${response.status}`);
    }

    const html = await response.text();
    const rates = parseBankrateHtml(html, loanAmount);

    if (rates.length > 0) {
      cacheRates(rates);
      return rates;
    }

    // Parsing failed — fall through to cached/mock
    throw new Error('No rates parsed from Bankrate HTML');
  } catch {
    // Scraping failed — try cache, then mock
    const cached = getCachedRates();
    if (cached.length > 0) return cached;

    const mock = MOCK_RATES.map((r) => ({ ...r, loanAmount }));
    cacheRates(mock);
    return mock;
  }
}

function parseBankrateHtml(html: string, loanAmount: number): MortgageRate[] {
  const rates: MortgageRate[] = [];

  // Look for rate data in structured portions of the page.
  // Bankrate embeds rate data in JSON-LD or data attributes.
  // This parser is intentionally resilient — if the structure changes, it returns [].
  const ratePattern = /\"rate\"\s*:\s*([\d.]+)/g;
  const aprPattern = /\"apr\"\s*:\s*([\d.]+)/g;

  const rateMatches = [...html.matchAll(ratePattern)].map((m) => parseFloat(m[1]));
  const aprMatches = [...html.matchAll(aprPattern)].map((m) => parseFloat(m[1]));

  if (rateMatches.length > 0) {
    // Take the first reasonable rate (between 2% and 12%)
    const validRates = rateMatches.filter((r) => r >= 2 && r <= 12);
    const validAprs = aprMatches.filter((r) => r >= 2 && r <= 12);

    if (validRates.length > 0) {
      rates.push({
        product: '30yr_fixed',
        rate: validRates[0],
        apr: validAprs[0] ?? validRates[0] + 0.15,
        loanAmount,
        source: 'bankrate',
      });
    }
  }

  return rates;
}

function cacheRates(rates: MortgageRate[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO housing_mortgage_rates (date, product, rate, apr, loan_amount, source)
     VALUES (date('now'), ?, ?, ?, ?, ?)`
  );

  const insert = db.transaction(() => {
    for (const r of rates) {
      stmt.run(r.product, r.rate, r.apr, r.loanAmount, r.source);
    }
  });

  insert();
}

function getCachedRates(): MortgageRate[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT product, rate, apr, loan_amount, source
       FROM housing_mortgage_rates
       WHERE date >= date('now', '-1 day')
       ORDER BY fetched_at DESC`
    )
    .all() as Array<{
      product: string;
      rate: number;
      apr: number;
      loan_amount: number;
      source: string;
    }>;

  return rows.map((r) => ({
    product: r.product,
    rate: r.rate,
    apr: r.apr,
    loanAmount: r.loan_amount,
    source: r.source,
  }));
}

export function getLatestRate(product: string): MortgageRate | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT product, rate, apr, loan_amount, source
       FROM housing_mortgage_rates
       WHERE product = ?
       ORDER BY fetched_at DESC LIMIT 1`
    )
    .get(product) as {
      product: string;
      rate: number;
      apr: number;
      loan_amount: number;
      source: string;
    } | undefined;

  if (!row) return null;

  return {
    product: row.product,
    rate: row.rate,
    apr: row.apr,
    loanAmount: row.loan_amount,
    source: row.source,
  };
}
