// Spending limit validation. Checks a transaction amount against
// user-configured thresholds stored in user_preferences and daily
// stats computed from mpp_transactions (including pending rows).

import { dbGet } from '../db';

export interface SpendValidation {
  valid: boolean;
  errors: string[];
}

async function getNumericPref(key: string, fallback: number): Promise<number> {
  const row = await dbGet<{ value: string }>(
    'SELECT value FROM user_preferences WHERE key = ?',
    key
  );
  if (!row) return fallback;
  const n = parseFloat(row.value);
  return isNaN(n) ? fallback : n;
}

export class SpendLimits {
  static async validateTransaction(amount: number): Promise<SpendValidation> {
    const errors: string[] = [];

    const maxTransaction = await getNumericPref('security.max_transaction', 1.00);
    const dailyLimit = await getNumericPref('daily_spend_limit', 5.00);
    const maxCount = await getNumericPref('security.daily_txn_count', 100);

    const todayStats = (await dbGet<{ spent: number; txn_count: number }>(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as spent,
        COUNT(*) as txn_count
      FROM mpp_transactions
      WHERE date(timestamp, 'localtime') = date('now', 'localtime')
        AND status IN ('pending', 'completed')
    `))!;

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

  static async getDailyStats(): Promise<{
    spent: number;
    limit: number;
    remaining: number;
    transactionsUsed: number;
    transactionLimit: number;
    transactionsRemaining: number;
  }> {
    const dailyLimit = await getNumericPref('daily_spend_limit', 5.00);
    const maxCount = await getNumericPref('security.daily_txn_count', 100);

    const stats = (await dbGet<{ spent: number; txn_count: number }>(`
      SELECT
        COALESCE(SUM(cost_usd), 0) as spent,
        COUNT(*) as txn_count
      FROM mpp_transactions
      WHERE date(timestamp, 'localtime') = date('now', 'localtime')
        AND status IN ('pending', 'completed')
    `))!;

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
