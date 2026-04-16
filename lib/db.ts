import Database from 'better-sqlite3';
import path from 'path';
import {
  CREATE_TABLES_SQL,
  DEFAULT_PREFERENCES,
  DEFAULT_MODULES,
  SCHEMA_VERSION,
} from './schema';
import { getRegisteredModules } from './modules';

const DB_PATH = path.join(process.cwd(), 'talaria.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initializeDatabase(_db);
  }
  return _db;
}

function initializeDatabase(db: Database.Database): void {
  const versionRow = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get();

  if (!versionRow) {
    // Fresh DB — create everything
    buildSchema(db);
    return;
  }

  // Check if schema is outdated
  const currentVersion = db
    .prepare('SELECT version FROM schema_version LIMIT 1')
    .get() as { version: number } | undefined;
  const fromVersion = currentVersion?.version ?? 0;

  if (fromVersion < SCHEMA_VERSION) {
    // Run migration + version bump inside a transaction. If the migration
    // throws (e.g. duplicate column from a partial prior run), the
    // transaction rolls back — no half-applied schema, no data loss.
    //
    // CRITICAL: We never fall back to drop-and-rebuild. If a migration
    // fails, the app refuses to start. Data loss is not acceptable.
    const migrate = db.transaction(() => {
      runMigrations(db, fromVersion);
      db.prepare(
        'INSERT OR REPLACE INTO schema_version (version) VALUES (?)'
      ).run(SCHEMA_VERSION);
    });
    migrate();
  }
}

// Per-version migration steps. Each entry brings the schema FROM the
// listed version TO the next one. Steps are applied in order. Add new
// steps as the schema evolves; never edit a published step.
//
// Currently empty — all schema changes prior to v6 used the
// drop-and-rebuild path. New schema versions starting from v7 should
// add additive migrations here so cached data (especially the ~$0.33
// of RentCast listings) survives.
function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const cols = db.pragma(`table_info(${table})`) as { name: string }[];
  return cols.some((c) => c.name === column);
}

function runMigrations(db: Database.Database, fromVersion: number): void {
  if (fromVersion < 7) {
    // Add status column for atomic transaction reservation (pending/completed/failed).
    // Idempotent — skips if column already exists (e.g. partial prior migration).
    if (!hasColumn(db, 'mpp_transactions', 'status')) {
      db.exec(`ALTER TABLE mpp_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON mpp_transactions(status)`);

    // Seed new security preferences (INSERT OR IGNORE preserves existing values)
    const seedPrefs: [string, string][] = [
      ['security.approval_mode', 'threshold'],
      ['security.max_transaction', '1.00'],
      ['security.auto_approve_under', '0.05'],
      ['security.biometric_above', '0.25'],
      ['security.daily_txn_count', '100'],
    ];
    const insert = db.prepare(
      'INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)'
    );
    for (const [key, value] of seedPrefs) {
      insert.run(key, value);
    }
  }

  if (fromVersion < 8) {
    // Add per-listing crime data column for per-listing scoring.
    if (!hasColumn(db, 'housing_listings', 'crime_count')) {
      db.exec(`ALTER TABLE housing_listings ADD COLUMN crime_count INTEGER`);
    }
  }

  if (fromVersion < 9) {
    // Portfolio module: accounts, transactions, manual balances.
    // Idempotent — CREATE TABLE IF NOT EXISTS.
    db.exec(`
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
    `);
  }
}

function buildSchema(db: Database.Database): void {
  db.exec(CREATE_TABLES_SQL);

  for (const mod of getRegisteredModules()) {
    for (const sql of mod.getTables()) {
      db.exec(sql);
    }
  }

  db.prepare(
    'INSERT OR REPLACE INTO schema_version (version) VALUES (?)'
  ).run(SCHEMA_VERSION);

  seedDefaults(db);

  // Restore wallet keys if they were preserved from a reset
  const saved = (db as Database.Database & { _walletKeys?: { key: string; value: string }[] })._walletKeys;
  if (saved && saved.length > 0) {
    const upsert = db.prepare(
      `INSERT OR REPLACE INTO user_preferences (key, value, updated_at)
       VALUES (?, ?, datetime('now'))`
    );
    for (const { key, value } of saved) {
      upsert.run(key, value);
    }
    delete (db as Database.Database & { _walletKeys?: unknown })._walletKeys;
  }
}

function resetDatabase(db: Database.Database): void {
  // Preserve wallet-related preferences across resets. Private keys
  // live in the OS keychain (see lib/security/keychain.ts), not in
  // talaria.db. These prefs cache display metadata only.
  let walletKeys: { key: string; value: string }[] = [];
  try {
    walletKeys = db
      .prepare("SELECT key, value FROM user_preferences WHERE key LIKE 'wallet.%'")
      .all() as { key: string; value: string }[];
  } catch {
    // Table may not exist yet
  }

  // Disable foreign key enforcement during drop. Otherwise dropping a
  // referenced table (e.g. housing_listings) before its referrers (e.g.
  // housing_tracked) raises SQLITE_CONSTRAINT_FOREIGNKEY. Re-enabled below.
  db.pragma('foreign_keys = OFF');
  try {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all() as { name: string }[];

    for (const { name } of tables) {
      db.exec(`DROP TABLE IF EXISTS "${name}"`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }

  // Store wallet keys to restore after rebuild
  (db as Database.Database & { _walletKeys?: typeof walletKeys })._walletKeys = walletKeys;
}

// Public reset requires biometric confirmation. This drops ALL tables
// and rebuilds from scratch — all cached data (listings, transactions,
// preferences) will be lost. Touch ID / system credential is mandatory.
export async function resetDb(): Promise<void> {
  const { ApprovalManager } = await import('./security/approval');
  const confirmed = await ApprovalManager.requestDestructiveConfirmation(
    'Reset Talaria database'
  );
  if (!confirmed) {
    throw new Error('Database reset denied — biometric confirmation required');
  }
  const db = getDb();
  resetDatabase(db);
  buildSchema(db);
}

function seedDefaults(db: Database.Database): void {
  const insertPref = db.prepare(
    'INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(DEFAULT_PREFERENCES)) {
    insertPref.run(key, value);
  }

  const insertModule = db.prepare(
    'INSERT OR IGNORE INTO modules (id, name, enabled) VALUES (?, ?, ?)'
  );
  for (const mod of DEFAULT_MODULES) {
    insertModule.run(mod.id, mod.name, mod.enabled);
  }
}
