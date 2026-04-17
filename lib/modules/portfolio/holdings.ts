// Compute portfolio holdings from stored transactions + manual balances.
// Holdings are derived, not stored — the source of truth is the
// transaction history (from CSV imports) and manual balance entries
// (for simple accounts like banks).

import { getDb } from '@/lib/db';

export interface Holding {
  account: string;
  asset: string;
  balance: number;
  costBasis: number | null;
  txCount: number;
  snapshotPrice: number | null; // price from CSV snapshot (fallback when Finnhub misses)
}

export interface AccountRow {
  id: number;
  name: string;
  type: string;
}

// ── Account helpers ─────────────────────────────────────────────────────

export function getOrCreateAccount(name: string, type: string): number {
  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM portfolio_accounts WHERE name = ?')
    .get(name) as { id: number } | undefined;
  if (existing) return existing.id;

  const result = db
    .prepare('INSERT INTO portfolio_accounts (name, type) VALUES (?, ?)')
    .run(name, type);
  return Number(result.lastInsertRowid);
}

export function getAccounts(): AccountRow[] {
  const db = getDb();
  return db
    .prepare('SELECT id, name, type FROM portfolio_accounts ORDER BY name')
    .all() as AccountRow[];
}

// ── Transaction storage ─────────────────────────────────────────────────

export interface ParsedTransaction {
  external_id: string;
  timestamp: string;
  tx_type: string;
  asset: string;
  quantity: number; // positive = increase, negative = decrease
  usd_value: number | null;
  metadata?: Record<string, unknown>;
}

// Bulk insert transactions, skipping duplicates via UNIQUE constraint.
// Returns count of new rows inserted.
export function insertTransactions(accountId: number, txs: ParsedTransaction[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO portfolio_transactions
      (account_id, external_id, timestamp, tx_type, asset, quantity, usd_value, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  const insertAll = db.transaction(() => {
    for (const tx of txs) {
      const result = stmt.run(
        accountId,
        tx.external_id,
        tx.timestamp,
        tx.tx_type,
        tx.asset,
        tx.quantity,
        tx.usd_value,
        tx.metadata ? JSON.stringify(tx.metadata) : null
      );
      if (result.changes > 0) inserted++;
    }
  });
  insertAll();

  return inserted;
}

// ── Manual balance ──────────────────────────────────────────────────────

export function setManualBalance(accountId: number, asset: string, balance: number): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO portfolio_manual_balances (account_id, asset, balance, updated_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(accountId, asset, balance);
}

// ── Compute holdings ────────────────────────────────────────────────────

function getSnapshotPrices(): Map<string, number> {
  const db = getDb();
  const snapshotRows = db.prepare(`
    SELECT asset, metadata FROM portfolio_transactions
    WHERE tx_type = 'snapshot' AND metadata IS NOT NULL
    ORDER BY timestamp DESC
  `).all() as Array<{ asset: string; metadata: string }>;

  const prices = new Map<string, number>();
  for (const row of snapshotRows) {
    if (prices.has(row.asset)) continue; // keep most recent
    try {
      const meta = JSON.parse(row.metadata);
      if (meta.snapshotPrice && typeof meta.snapshotPrice === 'number') {
        prices.set(row.asset, meta.snapshotPrice);
      }
    } catch {}
  }
  return prices;
}

export function getHoldings(): Holding[] {
  const db = getDb();

  // Sum quantities per (account, asset), excluding unvested tx types
  const txRows = db.prepare(`
    SELECT
      a.name as account,
      t.asset as asset,
      SUM(t.quantity) as balance,
      SUM(CASE WHEN t.quantity > 0 AND t.usd_value IS NOT NULL THEN t.usd_value ELSE 0 END) as cost_basis,
      COUNT(*) as tx_count
    FROM portfolio_transactions t
    JOIN portfolio_accounts a ON a.id = t.account_id
    WHERE t.tx_type NOT IN ('rsu')
      AND (t.metadata IS NULL OR json_extract(t.metadata, '$.restricted') IS NULL)
    GROUP BY t.account_id, t.asset
    HAVING ABS(SUM(t.quantity)) > 0.000001
    ORDER BY a.name, t.asset
  `).all() as Array<{
    account: string;
    asset: string;
    balance: number;
    cost_basis: number;
    tx_count: number;
  }>;

  const snapshotPrices = getSnapshotPrices();

  const txHoldings: Holding[] = txRows.map((r) => ({
    account: r.account,
    asset: r.asset,
    balance: r.balance,
    costBasis: r.cost_basis > 0 ? r.cost_basis : null,
    txCount: r.tx_count,
    snapshotPrice: snapshotPrices.get(r.asset) ?? null,
  }));

  // Add manual balances (bank accounts, etc.)
  const manualRows = db.prepare(`
    SELECT a.name as account, m.asset, m.balance
    FROM portfolio_manual_balances m
    JOIN portfolio_accounts a ON a.id = m.account_id
    WHERE m.balance != 0
  `).all() as Array<{ account: string; asset: string; balance: number }>;

  const manualHoldings: Holding[] = manualRows.map((r) => ({
    account: r.account,
    asset: r.asset,
    balance: r.balance,
    costBasis: r.asset === 'USD' ? r.balance : null,
    txCount: 0,
    snapshotPrice: null,
  }));

  return [...txHoldings, ...manualHoldings];
}

// ── Unvested / restricted holdings ─────────────────────────────────────

export interface UnvestedHolding {
  account: string;
  asset: string;
  balance: number;
  snapshotPrice: number | null;
  grants: Array<{
    grantDate: string;
    units: number;
    vestingDate: string | null;
    source: string;
  }>;
}

export function getUnvestedHoldings(): UnvestedHolding[] {
  const db = getDb();

  // Unvested RSU grants
  const rsuRows = db.prepare(`
    SELECT
      a.name as account,
      t.asset,
      t.quantity,
      t.timestamp,
      t.metadata
    FROM portfolio_transactions t
    JOIN portfolio_accounts a ON a.id = t.account_id
    WHERE t.tx_type = 'rsu'
    ORDER BY t.timestamp
  `).all() as Array<{
    account: string;
    asset: string;
    quantity: number;
    timestamp: string;
    metadata: string | null;
  }>;

  // Restricted ESPP/vest lots
  const restrictedRows = db.prepare(`
    SELECT
      a.name as account,
      t.asset,
      t.quantity,
      t.timestamp,
      t.metadata
    FROM portfolio_transactions t
    JOIN portfolio_accounts a ON a.id = t.account_id
    WHERE t.metadata IS NOT NULL
      AND json_extract(t.metadata, '$.restricted') IS NOT NULL
    ORDER BY t.timestamp
  `).all() as Array<{
    account: string;
    asset: string;
    quantity: number;
    timestamp: string;
    metadata: string | null;
  }>;

  const snapshotPrices = getSnapshotPrices();

  // Group by (account, asset)
  const grouped = new Map<string, UnvestedHolding>();

  for (const row of [...rsuRows, ...restrictedRows]) {
    const key = `${row.account}::${row.asset}`;
    let meta: Record<string, unknown> = {};
    try { meta = row.metadata ? JSON.parse(row.metadata) : {}; } catch {}

    if (!grouped.has(key)) {
      grouped.set(key, {
        account: row.account,
        asset: row.asset,
        balance: 0,
        snapshotPrice: snapshotPrices.get(row.asset) ?? (typeof meta.snapshotPrice === 'number' ? meta.snapshotPrice : null),
        grants: [],
      });
    }

    const holding = grouped.get(key)!;
    holding.balance += row.quantity;
    holding.grants.push({
      grantDate: row.timestamp,
      units: row.quantity,
      vestingDate: typeof meta.vestingDate === 'string' ? meta.vestingDate : null,
      source: typeof meta.source === 'string' ? meta.source : 'Unvested',
    });
  }

  return [...grouped.values()];
}
