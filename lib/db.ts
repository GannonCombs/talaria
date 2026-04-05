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
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    .get();

  if (!tableExists) {
    db.exec(CREATE_TABLES_SQL);

    // Create module-specific tables
    for (const mod of getRegisteredModules()) {
      for (const sql of mod.getTables()) {
        db.exec(sql);
      }
    }

    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(
      SCHEMA_VERSION
    );
    seedDefaults(db);
  }
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
