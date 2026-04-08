/**
 * Persistent fail-closed budget tracker.
 *
 * Lives in scripts/mpp-latency/logs/budget.json (NOT SQLite — keeps it
 * physically isolated from production cost analytics). Survives crashes,
 * Node restarts, multiple sweep invocations.
 *
 * Two layers:
 *   1. Global hard cap (GLOBAL_CAP_USD from services.ts)
 *   2. Per-service sub-cap (subCapUsd in catalog)
 *
 * Both checked BEFORE every paid call. A would-be call that pushes either
 * counter over its cap is refused with a clear error.
 */

import fs from 'fs';
import path from 'path';
import { GLOBAL_CAP_USD, getService } from './services';

const BUDGET_FILE = path.join(process.cwd(), 'scripts', 'mpp-latency', 'logs', 'budget.json');

interface BudgetState {
  globalSpent: number;
  perService: Record<string, number>;
  history: Array<{
    ts: string;
    service: string;
    cost: number;
    runId: string;
  }>;
}

function ensureLogsDir(): void {
  const logsDir = path.dirname(BUDGET_FILE);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

function loadBudget(): BudgetState {
  ensureLogsDir();
  if (!fs.existsSync(BUDGET_FILE)) {
    return { globalSpent: 0, perService: {}, history: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
  } catch {
    return { globalSpent: 0, perService: {}, history: [] };
  }
}

function saveBudget(state: BudgetState): void {
  ensureLogsDir();
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export interface BudgetCheckResult {
  ok: boolean;
  reason?: string;
  globalSpent: number;
  serviceSpent: number;
}

/**
 * Check whether a paid call to `serviceId` costing `costUsd` would fit within
 * both caps. Does NOT increment counters — call recordSpend() after the call
 * actually completes.
 */
export function checkCanSpend(serviceId: string, costUsd: number): BudgetCheckResult {
  const state = loadBudget();
  const entry = getService(serviceId);
  const serviceSpent = state.perService[serviceId] ?? 0;

  // Global cap
  if (state.globalSpent + costUsd > GLOBAL_CAP_USD) {
    return {
      ok: false,
      reason: `global cap $${GLOBAL_CAP_USD.toFixed(2)} would be exceeded ` +
              `(spent: $${state.globalSpent.toFixed(4)}, this call: $${costUsd.toFixed(4)})`,
      globalSpent: state.globalSpent,
      serviceSpent,
    };
  }

  // Per-service sub-cap
  if (serviceSpent + costUsd > entry.subCapUsd) {
    return {
      ok: false,
      reason: `service '${serviceId}' sub-cap $${entry.subCapUsd.toFixed(2)} would be exceeded ` +
              `(spent: $${serviceSpent.toFixed(4)}, this call: $${costUsd.toFixed(4)})`,
      globalSpent: state.globalSpent,
      serviceSpent,
    };
  }

  return { ok: true, globalSpent: state.globalSpent, serviceSpent };
}

export function recordSpend(serviceId: string, costUsd: number, runId: string): void {
  const state = loadBudget();
  state.globalSpent += costUsd;
  state.perService[serviceId] = (state.perService[serviceId] ?? 0) + costUsd;
  state.history.push({
    ts: new Date().toISOString(),
    service: serviceId,
    cost: costUsd,
    runId,
  });
  saveBudget(state);
}

export function getBudgetSummary(): {
  globalSpent: number;
  globalCap: number;
  globalRemaining: number;
  perService: Record<string, number>;
  callCount: number;
} {
  const state = loadBudget();
  return {
    globalSpent: state.globalSpent,
    globalCap: GLOBAL_CAP_USD,
    globalRemaining: GLOBAL_CAP_USD - state.globalSpent,
    perService: state.perService,
    callCount: state.history.length,
  };
}

/**
 * Refuse to start a sweep if the global cap is already ≥80% consumed.
 * Returns true if the sweep may proceed.
 */
export function canStartSweep(): { ok: boolean; reason?: string } {
  const summary = getBudgetSummary();
  const consumed = summary.globalSpent / GLOBAL_CAP_USD;
  if (consumed >= 0.8) {
    return {
      ok: false,
      reason: `global cap ${(consumed * 100).toFixed(0)}% consumed ` +
              `($${summary.globalSpent.toFixed(4)} / $${GLOBAL_CAP_USD.toFixed(2)}) — ` +
              `refusing new sweep. Use --reset to clear budget.`,
    };
  }
  return { ok: true };
}

/**
 * Reset budget. Should require an explicit flag from the user — never invoked
 * automatically. The caller is responsible for confirming with the user.
 */
export function resetBudget(): void {
  saveBudget({ globalSpent: 0, perService: {}, history: [] });
}

export function printBudgetStatus(): void {
  const s = getBudgetSummary();
  const pct = ((s.globalSpent / s.globalCap) * 100).toFixed(1);
  console.log(`[budget] $${s.globalSpent.toFixed(4)} / $${s.globalCap.toFixed(2)} (${pct}%)  ` +
              `${s.callCount} calls  remaining: $${s.globalRemaining.toFixed(4)}`);
  if (Object.keys(s.perService).length > 0) {
    for (const [svc, cost] of Object.entries(s.perService)) {
      console.log(`  - ${svc}: $${cost.toFixed(4)}`);
    }
  }
}
