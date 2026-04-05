import { getDb } from '@/lib/db';

const AUSTIN_LISTINGS = [
  // 78745 — South Austin
  { address: '7421 Oak Cliff Dr', zip: '78745', price: 432000, beds: 3, baths: 2, sqft: 1860, lot_sqft: 6500, year_built: 2004, hoa_monthly: 0, tax_annual: 8424, days_on_market: 12, latitude: 30.2100, longitude: -97.7800 },
  { address: '1204 Esperanza Ct', zip: '78745', price: 489000, beds: 4, baths: 3, sqft: 2430, lot_sqft: 7200, year_built: 2015, hoa_monthly: 45, tax_annual: 9536, days_on_market: 28, latitude: 30.2050, longitude: -97.7750 },
  { address: '8310 Willowick Dr', zip: '78745', price: 375000, beds: 3, baths: 2, sqft: 1540, lot_sqft: 5800, year_built: 1985, hoa_monthly: 0, tax_annual: 7313, days_on_market: 45, latitude: 30.2130, longitude: -97.7830 },
  { address: '2901 Gillis St', zip: '78745', price: 410000, beds: 3, baths: 2.5, sqft: 1720, lot_sqft: 4200, year_built: 2019, hoa_monthly: 75, tax_annual: 7995, days_on_market: 8, latitude: 30.2200, longitude: -97.7700 },
  // 78704 — South Congress / Zilker
  { address: '1510 S 3rd St', zip: '78704', price: 625000, beds: 3, baths: 2, sqft: 1650, lot_sqft: 5200, year_built: 1962, hoa_monthly: 0, tax_annual: 12188, days_on_market: 5, latitude: 30.2470, longitude: -97.7530 },
  { address: '2204 Kinney Ave', zip: '78704', price: 549000, beds: 2, baths: 2, sqft: 1380, lot_sqft: 4800, year_built: 1955, hoa_monthly: 0, tax_annual: 10706, days_on_market: 19, latitude: 30.2430, longitude: -97.7600 },
  { address: '900 W Annie St', zip: '78704', price: 710000, beds: 4, baths: 3, sqft: 2100, lot_sqft: 6000, year_built: 2020, hoa_monthly: 0, tax_annual: 13845, days_on_market: 3, latitude: 30.2500, longitude: -97.7570 },
  { address: '1801 Barton Springs Rd', zip: '78704', price: 475000, beds: 2, baths: 1, sqft: 1050, lot_sqft: 3500, year_built: 1948, hoa_monthly: 0, tax_annual: 9263, days_on_market: 62, latitude: 30.2600, longitude: -97.7620 },
  // 78749 — Circle C / Southwest
  { address: '5400 Davis Ln', zip: '78749', price: 520000, beds: 4, baths: 2.5, sqft: 2200, lot_sqft: 8000, year_built: 2001, hoa_monthly: 65, tax_annual: 10140, days_on_market: 15, latitude: 30.2200, longitude: -97.8500 },
  { address: '10201 Winding Trail', zip: '78749', price: 465000, beds: 3, baths: 2, sqft: 1850, lot_sqft: 7500, year_built: 1998, hoa_monthly: 55, tax_annual: 9068, days_on_market: 22, latitude: 30.2150, longitude: -97.8450 },
  { address: '6700 Escarpment Blvd', zip: '78749', price: 498000, beds: 4, baths: 3, sqft: 2350, lot_sqft: 6800, year_built: 2008, hoa_monthly: 85, tax_annual: 9711, days_on_market: 10, latitude: 30.2080, longitude: -97.8550 },
  // 78748 — Shady Hollow
  { address: '3100 Merlot Ct', zip: '78748', price: 445000, beds: 4, baths: 2.5, sqft: 2100, lot_sqft: 7000, year_built: 2003, hoa_monthly: 50, tax_annual: 8678, days_on_market: 18, latitude: 30.1800, longitude: -97.8200 },
  { address: '11500 Running Brush Ln', zip: '78748', price: 399000, beds: 3, baths: 2, sqft: 1680, lot_sqft: 6200, year_built: 1996, hoa_monthly: 40, tax_annual: 7781, days_on_market: 35, latitude: 30.1750, longitude: -97.8250 },
  { address: '4204 Briar Forest Dr', zip: '78748', price: 510000, beds: 4, baths: 3, sqft: 2450, lot_sqft: 8500, year_built: 2012, hoa_monthly: 75, tax_annual: 9945, days_on_market: 7, latitude: 30.1850, longitude: -97.8150 },
  { address: '12000 Shady Hollow Ct', zip: '78748', price: 385000, beds: 3, baths: 2, sqft: 1550, lot_sqft: 5900, year_built: 1994, hoa_monthly: 35, tax_annual: 7508, days_on_market: 52, latitude: 30.1700, longitude: -97.8300 },
  // 78731 — Northwest Hills
  { address: '4500 Far West Blvd', zip: '78731', price: 575000, beds: 3, baths: 2, sqft: 1900, lot_sqft: 9200, year_built: 1978, hoa_monthly: 0, tax_annual: 11213, days_on_market: 14, latitude: 30.3550, longitude: -97.7600 },
  { address: '3801 Greystone Dr', zip: '78731', price: 649000, beds: 4, baths: 3, sqft: 2600, lot_sqft: 10500, year_built: 1982, hoa_monthly: 0, tax_annual: 12656, days_on_market: 21, latitude: 30.3600, longitude: -97.7650 },
  { address: '6200 Mesa Dr', zip: '78731', price: 425000, beds: 3, baths: 2, sqft: 1600, lot_sqft: 7800, year_built: 1972, hoa_monthly: 0, tax_annual: 8288, days_on_market: 38, latitude: 30.3500, longitude: -97.7550 },
  { address: '5100 Westlake Dr', zip: '78731', price: 890000, beds: 5, baths: 4, sqft: 3400, lot_sqft: 14000, year_built: 2017, hoa_monthly: 120, tax_annual: 17355, days_on_market: 6, latitude: 30.3650, longitude: -97.7700 },
];

// Realistic neighborhood data for Austin target zips
// Crime index: 0-10 (higher = safer). School rating: 0-10. Walk score: 0-100.
// Commute times in minutes. Income = median household.
const AUSTIN_NEIGHBORHOODS = [
  { zip: '78745', walk_score: 35, crime_index: 5.8, school_rating: 5.5, median_income: 62000, commute_jollyville_min: 32, commute_downtown_min: 14 },
  { zip: '78704', walk_score: 72, crime_index: 5.2, school_rating: 6.8, median_income: 78000, commute_jollyville_min: 28, commute_downtown_min: 8 },
  { zip: '78749', walk_score: 22, crime_index: 7.5, school_rating: 7.2, median_income: 95000, commute_jollyville_min: 22, commute_downtown_min: 20 },
  { zip: '78748', walk_score: 18, crime_index: 7.8, school_rating: 6.5, median_income: 82000, commute_jollyville_min: 28, commute_downtown_min: 22 },
  { zip: '78731', walk_score: 30, crime_index: 8.2, school_rating: 8.5, median_income: 115000, commute_jollyville_min: 12, commute_downtown_min: 16 },
];

const MORTGAGE_RATES = [
  { product: '30yr_fixed', rate: 5.98, apr: 6.12, loan_amount: 440000 },
  { product: '15yr_fixed', rate: 5.25, apr: 5.41, loan_amount: 440000 },
  { product: '30yr_fha', rate: 5.65, apr: 6.45, loan_amount: 440000 },
  { product: '5yr_arm', rate: 5.45, apr: 6.08, loan_amount: 440000 },
];

const FED_PREDICTION = {
  meeting_date: '2026-05-07',
  cut_prob: 0.62,
  hold_prob: 0.35,
  hike_prob: 0.03,
  source: 'seed',
};

const SAMPLE_TRANSACTIONS = [
  { service: 'RentCast', module: 'Housing', endpoint: '/v1/properties', rail: 'tempo', costUsd: 0.03, via: 'usdc' },
  { service: 'Mapbox', module: 'Housing', endpoint: '/v1/isochrone', rail: 'tempo', costUsd: 0.01, via: 'usdc' },
  { service: 'OpenAI', module: 'Portfolio', endpoint: '/v1/chat/completions', rail: 'tempo', costUsd: 0.08, via: 'usdc' },
  { service: 'Firecrawl', module: 'Housing', endpoint: '/v2/crawl', rail: 'tempo', costUsd: 0.005, via: 'usdc' },
  { service: 'Whole Foods', module: 'Food', endpoint: null, rail: 'card', costUsd: 84.12, via: 'visa' },
  { service: 'Mortgage Payment', module: 'Housing', endpoint: null, rail: 'card', costUsd: 3240.00, via: 'visa' },
  { service: 'DoorDash', module: 'Food', endpoint: '/v1/orders', rail: 'card', costUsd: 32.19, via: 'stripe' },
  { service: 'Anthropic', module: 'Portfolio', endpoint: '/v1/messages', rail: 'card', costUsd: 0.12, via: 'stripe' },
  { service: 'Parallel', module: 'Portfolio', endpoint: '/v1/search', rail: 'card', costUsd: 0.05, via: 'link' },
  { service: 'Lightspark', module: 'Portfolio', endpoint: '/v1/pay', rail: 'lightning', costUsd: 5.00, via: 'btc' },
  { service: 'Alchemy', module: 'Portfolio', endpoint: '/v2/eth', rail: 'ethereum', costUsd: 0.02, via: 'eth' },
  { service: 'Jupiter', module: 'Portfolio', endpoint: '/v1/swap', rail: 'solana', costUsd: 1.25, via: 'sol' },
  { service: 'Codex', module: 'Portfolio', endpoint: '/graphql', rail: 'solana', costUsd: 0.04, via: 'usdc' },
  { service: 'Coinbase', module: 'Portfolio', endpoint: '/v2/trade', rail: 'base', costUsd: 15.00, via: 'usdc' },
  { service: 'StellarPay', module: 'Portfolio', endpoint: '/v1/transfer', rail: 'stellar', costUsd: 2.50, via: 'xlm' },
  { service: 'Ramp', module: 'Portfolio', endpoint: null, rail: 'bank', costUsd: 500.00, via: null },
  { service: 'Austin Energy', module: 'Housing', endpoint: null, rail: 'bank', costUsd: 112.50, via: null },
  { service: 'Alpha Vantage', module: 'Portfolio', endpoint: '/query', rail: 'tempo', costUsd: 0.00, via: 'usdc' },
  { service: 'ElevenLabs', module: 'Food', endpoint: '/v1/tts', rail: 'tempo', costUsd: 0.015, via: 'usdc' },
];

const AUSTIN_MARKET_STATS = [
  { zip: '78745', median_price: 415000, median_ppsf: 232, active_listings: 145, sold_count: 62, median_dom: 28 },
  { zip: '78704', median_price: 585000, median_ppsf: 385, active_listings: 87, sold_count: 34, median_dom: 18 },
  { zip: '78749', median_price: 495000, median_ppsf: 245, active_listings: 112, sold_count: 48, median_dom: 22 },
  { zip: '78748', median_price: 435000, median_ppsf: 220, active_listings: 98, sold_count: 41, median_dom: 30 },
  { zip: '78731', median_price: 575000, median_ppsf: 295, active_listings: 76, sold_count: 28, median_dom: 24 },
];

export function seedHousingData(): { listings: number; stats: number; neighborhoods: number; rates: number; transactions: number } {
  const db = getDb();

  const insertListing = db.prepare(
    `INSERT OR REPLACE INTO housing_listings
     (address, zip, price, beds, baths, sqft, lot_sqft, year_built, hoa_monthly, tax_annual, days_on_market, status, latitude, longitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  );

  const insertStats = db.prepare(
    `INSERT OR REPLACE INTO housing_market_stats
     (zip, date, median_price, median_ppsf, active_listings, sold_count, median_dom)
     VALUES (?, date('now'), ?, ?, ?, ?, ?)`
  );

  const insertListings = db.transaction(() => {
    for (const l of AUSTIN_LISTINGS) {
      insertListing.run(
        l.address, l.zip, l.price, l.beds, l.baths, l.sqft,
        l.lot_sqft, l.year_built, l.hoa_monthly, l.tax_annual,
        l.days_on_market, l.latitude, l.longitude
      );
    }
  });

  const insertMarketStats = db.transaction(() => {
    for (const s of AUSTIN_MARKET_STATS) {
      insertStats.run(
        s.zip, s.median_price, s.median_ppsf,
        s.active_listings, s.sold_count, s.median_dom
      );
    }
  });

  const insertNeighborhood = db.prepare(
    `INSERT OR REPLACE INTO housing_neighborhoods
     (zip, walk_score, crime_index, school_rating, median_income, commute_jollyville_min, commute_downtown_min)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const insertNeighborhoods = db.transaction(() => {
    for (const n of AUSTIN_NEIGHBORHOODS) {
      insertNeighborhood.run(
        n.zip, n.walk_score, n.crime_index, n.school_rating,
        n.median_income, n.commute_jollyville_min, n.commute_downtown_min
      );
    }
  });

  const insertRate = db.prepare(
    `INSERT OR REPLACE INTO housing_mortgage_rates (date, product, rate, apr, loan_amount, source)
     VALUES (date('now'), ?, ?, ?, ?, 'seed')`
  );

  const insertRates = db.transaction(() => {
    for (const r of MORTGAGE_RATES) {
      insertRate.run(r.product, r.rate, r.apr, r.loan_amount);
    }
  });

  const insertPrediction = db.prepare(
    `INSERT INTO housing_fed_predictions (date, meeting_date, cut_prob, hold_prob, hike_prob, source)
     VALUES (date('now'), ?, ?, ?, ?, ?)`
  );

  const insertTx = db.prepare(
    `INSERT INTO mpp_transactions (service, module, endpoint, rail, cost_usd, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const insertTransactions = db.transaction(() => {
    for (const tx of SAMPLE_TRANSACTIONS) {
      insertTx.run(
        tx.service, tx.module, tx.endpoint, tx.rail, tx.costUsd,
        tx.via ? JSON.stringify({ via: tx.via }) : null
      );
    }
  });

  insertListings();
  insertMarketStats();
  insertNeighborhoods();
  insertRates();
  insertPrediction.run(
    FED_PREDICTION.meeting_date,
    FED_PREDICTION.cut_prob,
    FED_PREDICTION.hold_prob,
    FED_PREDICTION.hike_prob,
    FED_PREDICTION.source
  );
  insertTransactions();

  return {
    listings: AUSTIN_LISTINGS.length,
    stats: AUSTIN_MARKET_STATS.length,
    neighborhoods: AUSTIN_NEIGHBORHOODS.length,
    rates: MORTGAGE_RATES.length,
    transactions: SAMPLE_TRANSACTIONS.length,
  };
}
