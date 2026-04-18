import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

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

const { reserveTransaction, completeTransaction, failTransaction, getTodaySpend } =
  await import('@/lib/mpp');

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
  `);
});

describe('reserveTransaction', () => {
  it('creates a pending transaction and returns its ID', async () => {
    const id = await reserveTransaction({
      service: 'RentCast',
      module: 'housing',
      endpoint: '/sale-listings',
      estimatedCostUsd: 0.033,
    });

    expect(id).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM mpp_transactions WHERE id = ?').get(Number(id)) as Record<string, unknown>;
    expect(row.service).toBe('RentCast');
    expect(row.module).toBe('housing');
    expect(row.endpoint).toBe('/sale-listings');
    expect(row.cost_usd).toBe(0.033);
    expect(row.status).toBe('pending');
    expect(row.rail).toBe('tempo');
  });

  it('stores metadata as JSON', async () => {
    const id = await reserveTransaction({
      service: 'Finnhub',
      module: 'portfolio',
      estimatedCostUsd: 0.001,
      metadata: { symbol: 'AAPL' },
    });

    const row = db.prepare('SELECT metadata FROM mpp_transactions WHERE id = ?').get(Number(id)) as { metadata: string };
    expect(JSON.parse(row.metadata)).toEqual({ symbol: 'AAPL' });
  });
});

describe('completeTransaction', () => {
  it('marks a pending transaction as completed', async () => {
    const id = await reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.01,
    });

    await completeTransaction(id);

    const row = db.prepare('SELECT status FROM mpp_transactions WHERE id = ?').get(Number(id)) as { status: string };
    expect(row.status).toBe('completed');
  });

  it('updates the cost when actual cost is provided', async () => {
    const id = await reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.05,
    });

    await completeTransaction(id, 0.033);

    const row = db.prepare('SELECT status, cost_usd FROM mpp_transactions WHERE id = ?').get(Number(id)) as { status: string; cost_usd: number };
    expect(row.status).toBe('completed');
    expect(row.cost_usd).toBe(0.033);
  });
});

describe('failTransaction', () => {
  it('marks a pending transaction as failed', async () => {
    const id = await reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.01,
    });

    await failTransaction(id);

    const row = db.prepare('SELECT status FROM mpp_transactions WHERE id = ?').get(Number(id)) as { status: string };
    expect(row.status).toBe('failed');
  });
});

describe('getTodaySpend', () => {
  it('returns 0 with no transactions', async () => {
    expect(await getTodaySpend()).toBe(0);
  });

  it('sums completed and pending transactions', async () => {
    await reserveTransaction({ service: 'a', module: 'a', estimatedCostUsd: 0.01 }); // pending
    const id = await reserveTransaction({ service: 'b', module: 'b', estimatedCostUsd: 0.02 });
    await completeTransaction(id); // completed

    expect(await getTodaySpend()).toBeCloseTo(0.03);
  });

  it('excludes failed transactions', async () => {
    const id = await reserveTransaction({ service: 'a', module: 'a', estimatedCostUsd: 0.05 });
    await failTransaction(id);

    expect(await getTodaySpend()).toBe(0);
  });

  it('excludes yesterday transactions', async () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status, timestamp) VALUES ('old', 'old', 1.00, 'completed', datetime('now', '-1 day'))"
    ).run();

    expect(await getTodaySpend()).toBe(0);
  });
});
