import { dbGet, dbAll, dbRun } from './db';

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

export async function logMppTransaction(params: {
  service: string;
  module: string;
  endpoint?: string;
  rail?: string;
  costUsd: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await dbRun(
    `INSERT INTO mpp_transactions (service, module, endpoint, rail, cost_usd, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
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
export async function getTodaySpend(): Promise<number> {
  const row = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total
     FROM mpp_transactions
     WHERE date(timestamp, 'localtime') = date('now', 'localtime')
       AND status IN ('pending', 'completed')`
  );
  return row!.total;
}

// ── Transaction reservation (for spending authorization) ────────────────

// Reserve a transaction slot BEFORE payment. Returns the row ID.
// The pending row counts toward daily limits immediately.
export async function reserveTransaction(params: {
  service: string;
  module: string;
  endpoint?: string;
  rail?: 'tempo' | 'card';
  estimatedCostUsd: number;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const result = await dbRun(
    `INSERT INTO mpp_transactions (service, module, endpoint, rail, cost_usd, status, metadata)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    params.service, params.module, params.endpoint ?? null,
    params.rail ?? 'tempo', params.estimatedCostUsd,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
  return Number(result.lastInsertRowid);
}

// Mark a reserved transaction as completed (with optional actual cost update).
export async function completeTransaction(id: number, actualCostUsd?: number): Promise<void> {
  if (actualCostUsd !== undefined) {
    await dbRun(
      `UPDATE mpp_transactions SET status = 'completed', cost_usd = ? WHERE id = ?`,
      actualCostUsd, id
    );
  } else {
    await dbRun(
      `UPDATE mpp_transactions SET status = 'completed' WHERE id = ?`,
      id
    );
  }
}

// Mark a reserved transaction as failed (user denied, payment error, etc.).
export async function failTransaction(id: number): Promise<void> {
  await dbRun(
    `UPDATE mpp_transactions SET status = 'failed' WHERE id = ?`,
    id
  );
}

export async function getMonthSpend(): Promise<number> {
  const row = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total
     FROM mpp_transactions
     WHERE strftime('%Y-%m', timestamp, 'localtime') = strftime('%Y-%m', 'now', 'localtime')`
  );
  return row!.total;
}

export async function getLifetimeSpend(): Promise<number> {
  const row = await dbGet<{ total: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) as total FROM mpp_transactions`
  );
  return row!.total;
}

export async function getTotalCalls(): Promise<number> {
  const row = await dbGet<{ count: number }>(
    `SELECT COUNT(*) as count FROM mpp_transactions`
  );
  return row!.count;
}

export async function getAvgCostPerSession(): Promise<number> {
  const row = await dbGet<{ avg: number }>(
    `SELECT COALESCE(AVG(cost_usd), 0) as avg FROM mpp_transactions`
  );
  return row!.avg;
}

export async function getTransactions(opts: {
  limit?: number;
  offset?: number;
  module?: string;
  service?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<{ transactions: Transaction[]; total: number }> {
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

  const countRow = await dbGet<{ count: number }>(
    `SELECT COUNT(*) as count FROM mpp_transactions ${where}`,
    ...params
  );

  const transactions = await dbAll<Transaction>(
    `SELECT * FROM mpp_transactions ${where}
     ORDER BY timestamp DESC
     LIMIT ? OFFSET ?`,
    ...params, opts.limit ?? 25, opts.offset ?? 0
  );

  return { transactions, total: countRow!.count };
}

export async function getSpendByService(
  dateFrom?: string,
  dateTo?: string
): Promise<ServiceSpend[]> {
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

  return dbAll<ServiceSpend>(
    `SELECT service, SUM(cost_usd) as total, COUNT(*) as count
     FROM mpp_transactions ${where}
     GROUP BY service
     ORDER BY total DESC`,
    ...params
  );
}

export async function getDailySpend(days: number): Promise<DailySpend[]> {
  return dbAll<DailySpend>(
    `SELECT date(timestamp, 'localtime') as date, SUM(cost_usd) as total, COUNT(*) as count
     FROM mpp_transactions
     WHERE timestamp >= datetime('now', ? || ' days')
     GROUP BY date(timestamp, 'localtime')
     ORDER BY date ASC`,
    `-${days}`
  );
}
