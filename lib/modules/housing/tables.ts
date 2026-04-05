export const HOUSING_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS housing_market_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zip TEXT NOT NULL,
    date TEXT NOT NULL,
    median_price REAL,
    median_ppsf REAL,
    active_listings INTEGER,
    sold_count INTEGER,
    median_dom INTEGER,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(zip, date)
  );

  CREATE TABLE IF NOT EXISTS housing_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL,
    zip TEXT NOT NULL,
    price REAL NOT NULL,
    beds INTEGER,
    baths REAL,
    sqft INTEGER,
    lot_sqft INTEGER,
    year_built INTEGER,
    hoa_monthly REAL DEFAULT 0,
    tax_annual REAL,
    listing_url TEXT,
    days_on_market INTEGER,
    status TEXT DEFAULT 'active',
    latitude REAL,
    longitude REAL,
    first_seen TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen TEXT NOT NULL DEFAULT (datetime('now')),
    deal_score REAL,
    monthly_cost REAL,
    metadata TEXT,
    UNIQUE(address, zip)
  );

  CREATE INDEX IF NOT EXISTS idx_listings_zip ON housing_listings(zip);
  CREATE INDEX IF NOT EXISTS idx_listings_deal_score ON housing_listings(deal_score);

  CREATE TABLE IF NOT EXISTS housing_mortgage_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    product TEXT NOT NULL,
    rate REAL NOT NULL,
    apr REAL,
    loan_amount REAL,
    source TEXT DEFAULT 'bankrate',
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(date, product, loan_amount)
  );

  CREATE TABLE IF NOT EXISTS housing_fed_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    meeting_date TEXT NOT NULL,
    cut_prob REAL,
    hold_prob REAL,
    hike_prob REAL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS housing_neighborhoods (
    zip TEXT PRIMARY KEY,
    walk_score REAL,
    crime_index REAL,
    school_rating REAL,
    median_income REAL,
    commute_jollyville_min REAL,
    commute_downtown_min REAL,
    composite_score REAL,
    polygon_geojson TEXT,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS housing_tracked (
    listing_id INTEGER PRIMARY KEY REFERENCES housing_listings(id),
    tracked_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT
  );
`;
