export const SCHEMA_VERSION = 13;

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

  CREATE TABLE IF NOT EXISTS fitness_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    muscle_groups TEXT,
    rotation_order INTEGER NOT NULL,
    exercises TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fitness_rotation_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    current_split_index INTEGER NOT NULL DEFAULT 0,
    last_workout_date TEXT
  );

  CREATE TABLE IF NOT EXISTS fitness_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_id INTEGER NOT NULL,
    exercise_name TEXT NOT NULL,
    exercise_type TEXT NOT NULL DEFAULT 'weighted',
    sort_order INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fitness_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'working',
    weight REAL,
    reps INTEGER
  );

  CREATE TABLE IF NOT EXISTS reading_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    pages INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS food_restaurants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resy_venue_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    cuisine TEXT,
    price_range INTEGER,
    rating REAL,
    neighborhood TEXT,
    address TEXT,
    latitude REAL,
    longitude REAL,
    image_url TEXT,
    description TEXT,
    resy_url TEXT,
    is_active INTEGER DEFAULT 1,
    last_cached_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_food_restaurants_cuisine ON food_restaurants(cuisine);
  CREATE INDEX IF NOT EXISTS idx_food_restaurants_active ON food_restaurants(is_active);

  CREATE TABLE IF NOT EXISTS food_favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    restaurant_id INTEGER NOT NULL REFERENCES food_restaurants(id),
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0,
    UNIQUE(restaurant_id)
  );

  CREATE TABLE IF NOT EXISTS food_reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resy_reservation_id TEXT,
    restaurant_id INTEGER REFERENCES food_restaurants(id),
    restaurant_name TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed',
    booked_at TEXT NOT NULL DEFAULT (datetime('now')),
    cancelled_at TEXT,
    config_token TEXT,
    seating_type TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_food_reservations_status ON food_reservations(status);
  CREATE INDEX IF NOT EXISTS idx_food_reservations_date ON food_reservations(date);
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
