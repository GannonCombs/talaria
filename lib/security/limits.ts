// Spending limit validation. Checks a transaction amount against
// user-configured thresholds stored in user_preferences and daily
// stats computed from mpp_transactions (including pending rows).

import { getDb } from '../db';

export interface SpendValidation {
  valid: boolean;
  errors: string[];
}

function getNumericPref(key: string, fallback: number): number {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM user_preferences WHERE key = ?')
    .get(key) as { value: string } | undefined;
  if (!row) return fallback;
  const n = parseFloat(row.value);
  return isNaN(n) ? fallback : n;
}

export class SpendLimits {
  static validateTransaction(amount: number): SpendValidation {
    const db = getDb();
    const errors: string[] = [];

    const maxTransaction = getNumericPref('security.max_transaction', 1.00);
    const dailyLimit = getNumericPref('daily_spend_limit', 5.00);
    const maxCount = getNumericPref('security.daily_txn_count', 100);

    const todayStats = db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as spent,
        COUNT(*) as txn_count
      FROM mpp_transactions
      WHERE date(timestamp, 'localtime') = date('now', 'localtime')
        AND status IN ('pending', 'completed')
    `).get() as { spent: number; txn_count: number };

    if (amount > maxTransaction) {
      errors.push(
        `Amount $${amount.toFixed(4)} exceeds max transaction limit of $${maxTransaction.toFixed(2)}`
      );
    }

    if (todayStats.spent + amount > dailyLimit) {
      errors.push(
        `Would exceed daily limit of $${dailyLimit.toFixed(2)} (spent today: $${todayStats.spent.toFixed(4)})`
      );
    }

    if (todayStats.txn_count >= maxCount) {
      errors.push(`Daily transaction count limit reached (${maxCount})`);
    }

    return { valid: errors.length === 0, errors };
  }

  static getDailyStats(): {
    spent: number;
    limit: number;
    remaining: number;
    transactionsUsed: number;
    transactionLimit: number;
    transactionsRemaining: number;
  } {
    const db = getDb();
    const dailyLimit = getNumericPref('daily_spend_limit', 5.00);
    const maxCount = getNumericPref('security.daily_txn_count', 100);

    const stats = db.prepare(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as spent,
        COUNT(*) as txn_count
      FROM mpp_transactions
      WHERE date(timestamp, 'localtime') = date('now', 'localtime')
        AND status IN ('pending', 'completed')
    `).get() as { spent: number; txn_count: number };

    return {
      spent: stats.spent,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - stats.spent),
      transactionsUsed: stats.txn_count,
      transactionLimit: maxCount,
      transactionsRemaining: Math.max(0, maxCount - stats.txn_count),
    };
  }
}
