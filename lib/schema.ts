export const SCHEMA_VERSION = 1;

export const CREATE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS mpp_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    service TEXT NOT NULL,
    module TEXT NOT NULL,
    endpoint TEXT,
    rail TEXT NOT NULL DEFAULT 'tempo',
    cost_usd REAL NOT NULL,
    request_hash TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON mpp_transactions(timestamp);
  CREATE INDEX IF NOT EXISTS idx_transactions_module ON mpp_transactions(module);
  CREATE INDEX IF NOT EXISTS idx_transactions_service ON mpp_transactions(service);

  CREATE TABLE IF NOT EXISTS user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_refreshed TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );
`;

export const DEFAULT_PREFERENCES: Record<string, string> = {
  // Global
  name: 'Gannon Combs',
  city: 'Austin',
  state: 'TX',
  daily_spend_limit: 'null',
  low_balance_alert: '2.00',
  auto_pause_empty: 'true',
  // Housing module
  'housing.budget': '550000',
  'housing.down_payment_pct': '20',
  'housing.loan_term_years': '30',
  'housing.credit_score_tier': 'excellent',
  'housing.target_zips': '["78745","78704","78749","78748","78731"]',
  'housing.work_address': '{"lat":30.4441,"lng":-97.7584,"label":"Visa Jollyville"}',
  'housing.downtown_address': '{"lat":30.2672,"lng":-97.7431,"label":"Downtown Austin"}',
  'housing.scoring_weights': '{"crime":9,"schools":5,"commute_work":7,"commute_downtown":6,"walkability":2,"income":5,"price":8}',
  'housing.alert_min_score': '85',
  'housing.max_price': '550000',
};

export const DEFAULT_MODULES = [
  { id: 'housing', name: 'Housing', enabled: 1 },
  { id: 'portfolio', name: 'Portfolio', enabled: 1 },
  { id: 'food', name: 'Food', enabled: 1 },
];
