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

  if (!currentVersion || currentVersion.version < SCHEMA_VERSION) {
    // Schema changed — drop all tables and rebuild
    resetDatabase(db);
    buildSchema(db);
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
  // Preserve wallet keys across resets
  let walletKeys: { key: string; value: string }[] = [];
  try {
    walletKeys = db
      .prepare("SELECT key, value FROM user_preferences WHERE key LIKE 'wallet.%'")
      .all() as { key: string; value: string }[];
  } catch {
    // Table may not exist yet
  }

  // Drop all tables
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as { name: string }[];

  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`);
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
