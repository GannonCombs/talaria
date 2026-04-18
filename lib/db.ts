import { createClient, type Client, type InStatement, type InValue, type Row } from '@libsql/client';
import path from 'path';
import {
  CREATE_TABLES_SQL,
  DEFAULT_PREFERENCES,
  DEFAULT_MODULES,
  SCHEMA_VERSION,
} from './schema';
import { getRegisteredModules } from './modules';

// ── Client singleton ───────────────────────────────────────────────────────

let _client: Client | null = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;

export function getClient(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL ?? `file:${path.join(process.cwd(), 'talaria.db')}`;
    _client = createClient({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

// Ensure schema is initialized before first query. Idempotent.
async function ensureInitialized(): Promise<void> {
  if (_initialized) return;
  if (!_initPromise) _initPromise = initializeDatabase();
  await _initPromise;
  _initialized = true;
}

// ── Compatibility helpers ──────────────────────────────────────────────────
// These minimize the diff across 24 consuming files. Each call ensures
// the schema is initialized before executing.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbGet<T = Row>(sql: string, ...args: any[]): Promise<T | undefined> {
  await ensureInitialized();
  const result = await getClient().execute({ sql, args });
  return (result.rows[0] as T) ?? undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbAll<T = Row>(sql: string, ...args: any[]): Promise<T[]> {
  await ensureInitialized();
  const result = await getClient().execute({ sql, args });
  return result.rows as T[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbRun(sql: string, ...args: any[]): Promise<{ lastInsertRowid: bigint; changes: number }> {
  await ensureInitialized();
  const result = await getClient().execute({ sql, args });
  return {
    lastInsertRowid: result.lastInsertRowid ?? BigInt(0),
    changes: result.rowsAffected,
  };
}

export async function dbExec(sql: string): Promise<void> {
  await ensureInitialized();
  await getClient().executeMultiple(sql);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function dbBatch(statements: any[]): Promise<void> {
  await ensureInitialized();
  if (statements.length === 0) return;
  await getClient().batch(statements, 'write');
}

// ── Schema initialization ──────────────────────────────────────────────────

async function initializeDatabase(): Promise<void> {
  const client = getClient();

  // Check if schema_version table exists
  const check = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  );

  if (check.rows.length === 0) {
    await buildSchema(client);
    return;
  }

  // Check if schema is outdated
  const versionResult = await client.execute('SELECT version FROM schema_version LIMIT 1');
  const fromVersion = versionResult.rows.length > 0
    ? Number(versionResult.rows[0].version)
    : 0;

  if (fromVersion < SCHEMA_VERSION) {
    await runMigrations(client, fromVersion);
    await client.execute({
      sql: 'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      args: [SCHEMA_VERSION],
    });
  }
}

// ── Migrations ─────────────────────────────────────────────────────────────

async function hasColumn(client: Client, table: string, column: string): Promise<boolean> {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((r) => r.name === column);
}

async function runMigrations(client: Client, fromVersion: number): Promise<void> {
  if (fromVersion < 7) {
    if (!(await hasColumn(client, 'mpp_transactions', 'status'))) {
      await client.execute(`ALTER TABLE mpp_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`);
    }
    await client.execute(`CREATE INDEX IF NOT EXISTS idx_transactions_status ON mpp_transactions(status)`);

    const seedPrefs: [string, string][] = [
      ['security.approval_mode', 'threshold'],
      ['security.max_transaction', '1.00'],
      ['security.auto_approve_under', '0.05'],
      ['security.biometric_above', '0.25'],
      ['security.daily_txn_count', '100'],
    ];
    await client.batch(
      seedPrefs.map(([key, value]) => ({
        sql: 'INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)',
        args: [key, value],
      })),
      'write'
    );
  }

  if (fromVersion < 8) {
    if (!(await hasColumn(client, 'housing_listings', 'crime_count'))) {
      await client.execute(`ALTER TABLE housing_listings ADD COLUMN crime_count INTEGER`);
    }
  }

  if (fromVersion < 9) {
    await client.executeMultiple(`
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

  if (fromVersion < 10) {
    await client.executeMultiple(`
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
    `);
  }
}

// ── Fresh DB build ─────────────────────────────────────────────────────────

async function buildSchema(client: Client): Promise<void> {
  await client.executeMultiple(CREATE_TABLES_SQL);

  for (const mod of getRegisteredModules()) {
    for (const sql of mod.getTables()) {
      await client.executeMultiple(sql);
    }
  }

  await client.execute({
    sql: 'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
    args: [SCHEMA_VERSION],
  });

  await seedDefaults(client);
}

// ── Reset (destructive — requires biometric confirmation) ──────────────────

export async function resetDb(): Promise<void> {
  const { ApprovalManager } = await import('./security/approval');
  const confirmed = await ApprovalManager.requestDestructiveConfirmation(
    'Reset Talaria database'
  );
  if (!confirmed) {
    throw new Error('Database reset denied — biometric confirmation required');
  }

  const client = getClient();

  // Preserve wallet-related preferences
  let walletKeys: { key: string; value: string }[] = [];
  try {
    const result = await client.execute("SELECT key, value FROM user_preferences WHERE key LIKE 'wallet.%'");
    walletKeys = result.rows as unknown as { key: string; value: string }[];
  } catch {
    // Table may not exist yet
  }

  // Drop all tables
  await client.execute("PRAGMA foreign_keys = OFF");
  try {
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    for (const { name } of tables.rows) {
      await client.execute(`DROP TABLE IF EXISTS "${name}"`);
    }
  } finally {
    await client.execute("PRAGMA foreign_keys = ON");
  }

  // Rebuild
  await buildSchema(client);

  // Restore wallet preferences
  if (walletKeys.length > 0) {
    await client.batch(
      walletKeys.map(({ key, value }) => ({
        sql: `INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
        args: [key, value],
      })),
      'write'
    );
  }

  // Reset init state so next call re-checks
  _initialized = false;
  _initPromise = null;
}

// ── Seed defaults ──────────────────────────────────────────────────────────

async function seedDefaults(client: Client): Promise<void> {
  const prefStatements = Object.entries(DEFAULT_PREFERENCES).map(([key, value]) => ({
    sql: 'INSERT OR IGNORE INTO user_preferences (key, value) VALUES (?, ?)',
    args: [key, value],
  }));

  const moduleStatements = DEFAULT_MODULES.map((mod) => ({
    sql: 'INSERT OR IGNORE INTO modules (id, name, enabled) VALUES (?, ?, ?)',
    args: [mod.id, mod.name, mod.enabled],
  }));

  await client.batch([...prefStatements, ...moduleStatements] as InStatement[], 'write');
}
