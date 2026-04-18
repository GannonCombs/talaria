import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

// Create an in-memory DB with the required tables
let db: Database.Database;

vi.mock('@/lib/db', () => ({
  dbGet: async (sql: string, ...args: unknown[]) => {
    return db.prepare(sql).get(...args) as Record<string, unknown> | undefined;
  },
  dbAll: async (sql: string, ...args: unknown[]) => {
    return db.prepare(sql).all(...args);
  },
  dbRun: async (sql: string, ...args: unknown[]) => {
    const result = db.prepare(sql).run(...args);
    return { lastInsertRowid: BigInt(result.lastInsertRowid), changes: result.changes };
  },
  dbExec: async (sql: string) => {
    db.exec(sql);
  },
  dbBatch: async () => {},
}));

// Import after mock is set up
const { SpendLimits } = await import('@/lib/security/limits');

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(`
    CREATE TABLE mpp_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      service TEXT NOT NULL,
      module TEXT NOT NULL,
      endpoint TEXT,
      rail TEXT NOT NULL DEFAULT 'tempo',
      cost_usd REAL NOT NULL,
      request_hash TEXT,
      metadata TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      crime_count INTEGER
    );
    CREATE TABLE user_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default security preferences
  const insert = db.prepare('INSERT INTO user_preferences (key, value) VALUES (?, ?)');
  insert.run('security.max_transaction', '1.00');
  insert.run('daily_spend_limit', '5.00');
  insert.run('security.daily_txn_count', '100');
});

describe('SpendLimits.validateTransaction', () => {
  it('allows a transaction under all limits', async () => {
    const result = await SpendLimits.validateTransaction(0.033);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a transaction exceeding max_transaction', async () => {
    const result = await SpendLimits.validateTransaction(1.50);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('max transaction limit');
  });

  it('rejects when daily spend would be exceeded', async () => {
    // Insert $4.99 of spending today
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 4.99, 'completed')"
    ).run();

    const result = await SpendLimits.validateTransaction(0.02);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('daily limit');
  });

  it('counts pending transactions toward daily limit', async () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 4.99, 'pending')"
    ).run();

    const result = await SpendLimits.validateTransaction(0.02);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('daily limit');
  });

  it('does not count failed transactions toward daily limit', async () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 4.99, 'failed')"
    ).run();

    const result = await SpendLimits.validateTransaction(0.02);
    expect(result.valid).toBe(true);
  });

  it('rejects when daily transaction count is reached', async () => {
    // Set a low count limit
    db.prepare("UPDATE user_preferences SET value = '3' WHERE key = 'security.daily_txn_count'").run();

    // Insert 3 completed transactions today
    for (let i = 0; i < 3; i++) {
      db.prepare(
        "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 0.001, 'completed')"
      ).run();
    }

    const result = await SpendLimits.validateTransaction(0.001);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('transaction count');
  });

  it('does not count yesterday transactions toward daily limit', async () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status, timestamp) VALUES ('test', 'test', 4.99, 'completed', datetime('now', '-1 day'))"
    ).run();

    const result = await SpendLimits.validateTransaction(0.02);
    expect(result.valid).toBe(true);
  });

  it('can return multiple errors at once', async () => {
    // Set very low limits
    db.prepare("UPDATE user_preferences SET value = '0.01' WHERE key = 'security.max_transaction'").run();
    db.prepare("UPDATE user_preferences SET value = '0.005' WHERE key = 'daily_spend_limit'").run();

    const result = await SpendLimits.validateTransaction(0.05);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('SpendLimits.getDailyStats', () => {
  it('returns zeros with no transactions', async () => {
    const stats = await SpendLimits.getDailyStats();
    expect(stats.spent).toBe(0);
    expect(stats.transactionsUsed).toBe(0);
    expect(stats.limit).toBe(5.00);
    expect(stats.remaining).toBe(5.00);
    expect(stats.transactionLimit).toBe(100);
    expect(stats.transactionsRemaining).toBe(100);
  });

  it('reflects current spending', async () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 0.033, 'completed')"
    ).run();
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status) VALUES ('test', 'test', 0.001, 'pending')"
    ).run();

    const stats = await SpendLimits.getDailyStats();
    expect(stats.spent).toBeCloseTo(0.034);
    expect(stats.transactionsUsed).toBe(2);
    expect(stats.remaining).toBeCloseTo(4.966);
    expect(stats.transactionsRemaining).toBe(98);
  });
});
