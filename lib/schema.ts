export const SCHEMA_VERSION = 10;

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
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'completed'
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

  CREATE TABLE IF NOT EXISTS portfolio_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES portfolio_accounts(id),
    external_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    tx_type TEXT NOT NULL,
    asset TEXT NOT NULL,
    quantity REAL NOT NULL,
    usd_value REAL,
    metadata TEXT,
    UNIQUE(account_id, external_id, asset, quantity)
  );

  CREATE INDEX IF NOT EXISTS idx_portfolio_tx_asset ON portfolio_transactions(asset);
  CREATE INDEX IF NOT EXISTS idx_portfolio_tx_account ON portfolio_transactions(account_id);

  CREATE TABLE IF NOT EXISTS portfolio_manual_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES portfolio_accounts(id),
    asset TEXT NOT NULL,
    balance REAL NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, asset)
  );

  CREATE TABLE IF NOT EXISTS fitness_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cardio',
    activity TEXT NOT NULL DEFAULT 'run',
    duration_minutes REAL,
    distance_miles REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

export const DEFAULT_PREFERENCES: Record<string, string> = {
  // Global
  name: 'Gannon Combs',
  city: 'Austin',
  state: 'TX',
  daily_spend_limit: '5',
  low_balance_alert: '5.00',
  'security.approval_mode': 'always-biometric',
  'security.max_transaction': '1.00',
  'security.auto_approve_under': '0.05',
  'security.biometric_above': '0.25',
  'security.daily_txn_count': '100',
  // Housing module
  'housing.budget': '550000',
  'housing.down_payment_pct': '20',
  'housing.loan_term_years': '30',
  'housing.credit_score_tier': 'excellent',
  'housing.target_zips': '["78745","78704","78749","78748","78731"]',
  'housing.work_address': '{"lat":30.4441,"lng":-97.7584,"label":"Visa Jollyville"}',
  'housing.downtown_address': '{"lat":30.2672,"lng":-97.7431,"label":"Downtown Austin"}',
  'housing.scoring_weights': '{"crime":9,"schools":5,"commute_work":7,"commute_social":6,"walkability":2,"avm":5,"price":8}',
  'housing.alert_min_score': '85',
  'housing.max_price': '550000',
};

export const DEFAULT_MODULES = [
  { id: 'housing', name: 'Housing', enabled: 1 },
  { id: 'portfolio', name: 'Portfolio', enabled: 1 },
  { id: 'food', name: 'Food', enabled: 1 },
];
