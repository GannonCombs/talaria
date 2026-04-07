import { getDb } from './db';

export interface Transaction {
  id: number;
  timestamp: string;
  service: string;
  module: string;
  endpoint: string | null;
  rail: 'tempo' | 'card';
  cost_usd: number;
  request_hash: string | null;
  metadata: string | null;
}

export interface ServiceSpend {
  service: string;
  total: number;
  count: number;
}

export interface DailySpend {
  date: string;
  total: number;
  count: number;
}

export function logMppTransaction(params: {
  service: string;
  module: string;
  endpoint?: string;
  rail?: string;
  costUsd: number;
  metadata?: Record<string, unknown>;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO mpp_transactions (service, module, endpoint, rail, cost_usd, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.service,
    params.module,
    params.endpoint ?? null,
    params.rail ?? 'tempo',
    params.costUsd,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
}

// Day-bucketing queries use SQLite's `'localtime'` modifier so "today" and
// "this month" mean the user's local day/month, not UTC. The dev server
// runs on the user's machine (Central), so localtime is Central. Stored
// timestamps remain UTC; the conversion is purely for the comparison.
export function getTodaySpend(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM mpp_transactions
       WHERE date(timestamp, 'localtime') = date('now', 'localtime')`
    )
    .get() as { total: number };
  return row.total;
}

export function getMonthSpend(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) as total
       FROM mpp_transactions
       WHERE strftime('%Y-%m', timestamp, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`
    )
    .get() as { total: number };
  return row.total;
}

export function getLifetimeSpend(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) as total FROM mpp_transactions`
    )
    .get() as { total: number };
  return row.total;
}

export function getTotalCalls(): number {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) as count FROM mpp_transactions`)
    .get() as { count: number };
  return row.count;
}

export function getAvgCostPerSession(): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(AVG(cost_usd), 0) as avg FROM mpp_transactions`
    )
    .get() as { avg: number };
  return row.avg;
}

export function getTransactions(opts: {
  limit?: number;
  offset?: number;
  module?: string;
  service?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): { transactions: Transaction[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.module) {
    conditions.push('module = ?');
    params.push(opts.module);
  }
  if (opts.service) {
    conditions.push('service = ?');
    params.push(opts.service);
  }
  if (opts.dateFrom) {
    conditions.push('timestamp >= ?');
    params.push(opts.dateFrom);
  }
  if (opts.dateTo) {
    conditions.push('timestamp <= ?');
    params.push(opts.dateTo);
  }
  if (opts.search) {
    conditions.push(
      '(service LIKE ? OR module LIKE ? OR endpoint LIKE ?)'
    );
    const like = `%${opts.search}%`;
    params.push(like, like, like);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const countRow = db
    .prepare(`SELECT COUNT(*) as count FROM mpp_transactions ${where}`)
    .get(...params) as { count: number };

  const transactions = db
    .prepare(
      `SELECT * FROM mpp_transactions ${where}
       ORDER BY timestamp DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, opts.limit ?? 25, opts.offset ?? 0) as Transaction[];

  return { transactions, total: countRow.count };
}

export function getSpendByService(
  dateFrom?: string,
  dateTo?: string
): ServiceSpend[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (dateFrom) {
    conditions.push('timestamp >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('timestamp <= ?');
    params.push(dateTo);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  return db
    .prepare(
      `SELECT service, SUM(cost_usd) as total, COUNT(*) as count
       FROM mpp_transactions ${where}
       GROUP BY service
       ORDER BY total DESC`
    )
    .all(...params) as ServiceSpend[];
}

export function getDailySpend(days: number): DailySpend[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT date(timestamp, 'localtime') as date, SUM(cost_usd) as total, COUNT(*) as count
       FROM mpp_transactions
       WHERE timestamp >= datetime('now', ? || ' days')
       GROUP BY date(timestamp, 'localtime')
       ORDER BY date ASC`
    )
    .all(`-${days}`) as DailySpend[];
}
