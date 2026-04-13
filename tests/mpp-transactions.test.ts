import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let db: Database.Database;

vi.mock('@/lib/db', () => ({
  getDb: () => db,
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
  it('creates a pending transaction and returns its ID', () => {
    const id = reserveTransaction({
      service: 'RentCast',
      module: 'housing',
      endpoint: '/sale-listings',
      estimatedCostUsd: 0.033,
    });

    expect(id).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM mpp_transactions WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.service).toBe('RentCast');
    expect(row.module).toBe('housing');
    expect(row.endpoint).toBe('/sale-listings');
    expect(row.cost_usd).toBe(0.033);
    expect(row.status).toBe('pending');
    expect(row.rail).toBe('tempo');
  });

  it('stores metadata as JSON', () => {
    const id = reserveTransaction({
      service: 'Finnhub',
      module: 'portfolio',
      estimatedCostUsd: 0.001,
      metadata: { symbol: 'AAPL' },
    });

    const row = db.prepare('SELECT metadata FROM mpp_transactions WHERE id = ?').get(id) as { metadata: string };
    expect(JSON.parse(row.metadata)).toEqual({ symbol: 'AAPL' });
  });
});

describe('completeTransaction', () => {
  it('marks a pending transaction as completed', () => {
    const id = reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.01,
    });

    completeTransaction(id);

    const row = db.prepare('SELECT status FROM mpp_transactions WHERE id = ?').get(id) as { status: string };
    expect(row.status).toBe('completed');
  });

  it('updates the cost when actual cost is provided', () => {
    const id = reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.05,
    });

    completeTransaction(id, 0.033);

    const row = db.prepare('SELECT status, cost_usd FROM mpp_transactions WHERE id = ?').get(id) as { status: string; cost_usd: number };
    expect(row.status).toBe('completed');
    expect(row.cost_usd).toBe(0.033);
  });
});

describe('failTransaction', () => {
  it('marks a pending transaction as failed', () => {
    const id = reserveTransaction({
      service: 'test', module: 'test', estimatedCostUsd: 0.01,
    });

    failTransaction(id);

    const row = db.prepare('SELECT status FROM mpp_transactions WHERE id = ?').get(id) as { status: string };
    expect(row.status).toBe('failed');
  });
});

describe('getTodaySpend', () => {
  it('returns 0 with no transactions', () => {
    expect(getTodaySpend()).toBe(0);
  });

  it('sums completed and pending transactions', () => {
    reserveTransaction({ service: 'a', module: 'a', estimatedCostUsd: 0.01 }); // pending
    const id = reserveTransaction({ service: 'b', module: 'b', estimatedCostUsd: 0.02 });
    completeTransaction(id); // completed

    expect(getTodaySpend()).toBeCloseTo(0.03);
  });

  it('excludes failed transactions', () => {
    const id = reserveTransaction({ service: 'a', module: 'a', estimatedCostUsd: 0.05 });
    failTransaction(id);

    expect(getTodaySpend()).toBe(0);
  });

  it('excludes yesterday transactions', () => {
    db.prepare(
      "INSERT INTO mpp_transactions (service, module, cost_usd, status, timestamp) VALUES ('old', 'old', 1.00, 'completed', datetime('now', '-1 day'))"
    ).run();

    expect(getTodaySpend()).toBe(0);
  });
});
