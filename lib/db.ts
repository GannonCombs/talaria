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
    // Try additive ALTER-based migration first. If we can walk version
    // by version applying small changes, we preserve cached data (e.g.
    // the ~$0.33 of Austin RentCast listings). Falls back to a full
    // drop-and-rebuild if any migration step throws.
    try {
      runMigrations(db, fromVersion);
      db.prepare(
        'INSERT OR REPLACE INTO schema_version (version) VALUES (?)'
      ).run(SCHEMA_VERSION);
    } catch (err) {
      console.warn(
        `[db] Additive migration ${fromVersion}→${SCHEMA_VERSION} failed, falling back to drop-and-rebuild:`,
        err instanceof Error ? err.message : err
      );
      resetDatabase(db);
      buildSchema(db);
    }
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
function runMigrations(db: Database.Database, fromVersion: number): void {
  // No-op when fromVersion >= SCHEMA_VERSION. Future migrations go
  // here as `if (fromVersion < N) { ... }` blocks in ascending order.
  void db;
  void fromVersion;
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
  // Preserve wallet keys across resets. Note: real PKs live in
  // ~/.agentcash/, NOT in talaria.db. This pref only caches a derived
  // public Solana address for display, but we keep the same shape so
  // any future cached wallet metadata is also preserved.
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

export function resetDb(): void {
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
