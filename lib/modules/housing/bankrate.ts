import { getDb } from '@/lib/db';
import { Resolver } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';

export interface MortgageRate {
  product: string;
  rate: number;
  apr: number;
  loanAmount: number;
  lender: string;
  monthlyPayment: number;
  points: number;
  source: string;
}

export interface BankrateParams {
  purchasePrice: number;
  downPayment: number;
  creditScore: number;
  zipCode: string;
}

const DEFAULTS: BankrateParams = {
  purchasePrice: 540000,
  downPayment: 108000,
  creditScore: 780,
  zipCode: '78757',
};

export async function fetchBankrateRates(
  params?: Partial<BankrateParams>
): Promise<MortgageRate[]> {
  const p = { ...DEFAULTS, ...params };
  const loanAmount = p.purchasePrice - p.downPayment;

  const url = new URL('https://mortgage-api.bankrate.com/rates/v4/');
  url.searchParams.set('loanType', 'purchase');
  url.searchParams.set('propertyValue', String(p.purchasePrice));
  url.searchParams.set('propertyType', 'SingleFamily');
  url.searchParams.set('propertyUse', 'PrimaryResidence');
  url.searchParams.set('zipCode', p.zipCode);
  url.searchParams.set('loanAmount', String(loanAmount));
  url.searchParams.set('creditScore', String(p.creditScore));
  url.searchParams.set('pointsRange', 'All');
  url.searchParams.append('productFamilies[]', 'conventional');
  url.searchParams.append('loanTerms[]', '30yr');
  url.searchParams.append('loanTerms[]', '20yr');
  url.searchParams.append('loanTerms[]', '15yr');
  url.searchParams.append('loanTerms[]', '10yr');
  url.searchParams.set('pid', 'br3');
  url.searchParams.set('veteranStatus', 'NoMilitaryService');
  url.searchParams.set('firstTimeHomeBuyer', 'false');
  url.searchParams.append('displayTargets[]', 'mobileRateTable');
  url.searchParams.append('deviceTypes[]', 'mobile');
  url.searchParams.set('clientId', 'MortgageRateTable');
  url.searchParams.set('includeSponsored', 'true');
  url.searchParams.set('includeEditorial', 'true');

  try {
    // Resolve via Google DNS to bypass Cisco Umbrella blocking this domain
    const resolver = new Resolver();
    resolver.setServers(['8.8.8.8', '8.8.4.4']);
    const [resolvedIp] = await resolver.resolve4('mortgage-api.bankrate.com');

    const response = await new Promise<{ ok: boolean; status: number; json: () => unknown }>((resolve, reject) => {
      const req = httpsRequest({
        hostname: resolvedIp,
        port: 443,
        path: url.pathname + url.search,
        method: 'GET',
        servername: 'mortgage-api.bankrate.com',
        headers: {
          Host: 'mortgage-api.bankrate.com',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
          Origin: 'https://www.bankrate.com',
          Referer: 'https://www.bankrate.com/mortgages/mortgage-rates/',
        },
        timeout: 15000,
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({
          ok: res.statusCode! >= 200 && res.statusCode! < 300,
          status: res.statusCode!,
          json: () => JSON.parse(body),
        }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Bankrate request timeout')); });
      req.end();
    });

    if (!response.ok) throw new Error(`Bankrate API ${response.status}`);

    const data = response.json() as Record<string, unknown>;
    const offers = (data as { offers: unknown }).offers as Array<{
      advertiser?: { name?: string };
      product?: { term?: string; type?: string };
      rate: number;
      apr: number;
      estimatedPayment: number;
      points: number;
    }>;

    if (!offers || offers.length === 0) throw new Error('No offers');

    const rates: MortgageRate[] = offers
      .filter((o) => o.rate > 0)
      .map((o) => {
        const term = o.product?.term ?? '';
        let product = '30yr_fixed';
        if (term.includes('10')) product = '10yr_fixed';
        else if (term.includes('15')) product = '15yr_fixed';
        else if (term.includes('20')) product = '20yr_fixed';

        return {
          product,
          rate: o.rate,
          apr: o.apr,
          loanAmount,
          lender: o.advertiser?.name ?? 'Unknown',
          monthlyPayment: o.estimatedPayment ?? 0,
          points: o.points ?? 0,
          source: 'bankrate',
        };
      });

    rates.sort((a, b) => a.rate - b.rate);
    cacheRates(rates);
    return rates;
  } catch (err) {
    console.error('Bankrate API failed:', err);
    return getCachedRates();
  }
}

// ── Cache ──

function cacheRates(rates: MortgageRate[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO housing_mortgage_rates (date, product, rate, apr, loan_amount, source)
     VALUES (date('now'), ?, ?, ?, ?, ?)`
  );

  // Cache best rate per product only
  const best = new Map<string, MortgageRate>();
  for (const r of rates) {
    if (!best.has(r.product) || r.rate < best.get(r.product)!.rate) {
      best.set(r.product, r);
    }
  }

  const insert = db.transaction(() => {
    for (const r of best.values()) {
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
       ORDER BY rate ASC`
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
    lender: '',
    monthlyPayment: 0,
    points: 0,
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
    lender: '',
    monthlyPayment: 0,
    points: 0,
    source: row.source,
  };
}

export function getBestRate(): MortgageRate | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT product, rate, apr, loan_amount, source
       FROM housing_mortgage_rates
       ORDER BY rate ASC LIMIT 1`
    )
    .get() as {
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
    lender: '',
    monthlyPayment: 0,
    points: 0,
    source: row.source,
  };
}
