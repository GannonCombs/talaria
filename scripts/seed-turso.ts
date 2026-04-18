/**
 * Seed Turso database from local talaria.db.
 *
 * Reads all tables and rows from the local better-sqlite3 database,
 * creates the schema on Turso, and inserts all data in batches.
 *
 * Usage:
 *   npx tsx scripts/seed-turso.ts
 *
 * Requires .env.local with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from '../lib/schema';
import { HOUSING_TABLES_SQL } from '../lib/modules/housing/tables';

// Load .env.local manually (Node doesn't auto-load it)
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) {
      process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
}

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in .env.local');
  process.exit(1);
}

const DB_PATH = path.join(process.cwd(), 'talaria.db');
if (!fs.existsSync(DB_PATH)) {
  console.error('ERROR: talaria.db not found at', DB_PATH);
  process.exit(1);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Talaria → Turso Database Migration');
  console.log('='.repeat(60));
  console.log();
  console.log(`Source: ${DB_PATH}`);
  console.log(`Target: ${TURSO_URL}`);
  console.log();

  // Open local DB
  const local = new Database(DB_PATH, { readonly: true });

  // Connect to Turso
  const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // Test connection
  try {
    await turso.execute('SELECT 1');
    console.log('[✓] Turso connection OK');
  } catch (err) {
    console.error('[✗] Turso connection failed:', (err as Error).message);
    process.exit(1);
  }

  // Step 1: Create schema on Turso
  console.log('\n[1/3] Creating schema...');
  try {
    await turso.executeMultiple(CREATE_TABLES_SQL);
    await turso.executeMultiple(HOUSING_TABLES_SQL);
    // Set schema version
    await turso.execute({
      sql: 'INSERT OR REPLACE INTO schema_version (version) VALUES (?)',
      args: [SCHEMA_VERSION],
    });
    console.log(`  Schema version: ${SCHEMA_VERSION}`);
  } catch (err) {
    console.error('  Schema creation failed:', (err as Error).message);
    process.exit(1);
  }

  // Step 2: Get all tables with data from local DB
  console.log('\n[2/3] Reading local data...');
  const tables = local
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  const tableData: { name: string; columns: string[]; rows: unknown[][] }[] = [];

  for (const { name } of tables) {
    const rows = local.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`  ${name}: 0 rows (skip)`);
      continue;
    }
    const columns = Object.keys(rows[0]);
    const rawRows = rows.map((r) => columns.map((c) => r[c]));
    tableData.push({ name, columns, rows: rawRows });
    console.log(`  ${name}: ${rows.length} rows`);
  }

  // Step 3: Insert data into Turso in batches
  console.log('\n[3/3] Inserting into Turso...');
  const BATCH_SIZE = 50; // Turso batch limit is generous, but keep it reasonable

  for (const { name, columns, rows } of tableData) {
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR REPLACE INTO "${name}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const statements = batch.map((row) => ({
        sql,
        args: row.map((v) => {
          // libsql doesn't accept undefined; convert to null
          if (v === undefined) return null;
          // Convert Buffer/Uint8Array to null (unlikely but safe)
          if (v instanceof Buffer || v instanceof Uint8Array) return null;
          return v as string | number | null;
        }),
      }));

      await turso.batch(statements, 'write');
      inserted += batch.length;
    }
    console.log(`  ${name}: ${inserted} rows inserted`);
  }

  // Verify
  console.log('\n' + '='.repeat(60));
  console.log('Verification:');
  for (const { name, rows } of tableData) {
    const result = await turso.execute(`SELECT COUNT(*) as n FROM "${name}"`);
    const remoteCount = Number(result.rows[0].n);
    const match = remoteCount === rows.length ? '✓' : '✗ MISMATCH';
    console.log(`  ${name}: local=${rows.length} turso=${remoteCount} ${match}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration complete! Local talaria.db is untouched (backup).');
  console.log('='.repeat(60));

  local.close();
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
