export interface DashboardMetrics {
  primary: {
    label: string;
    value: string;
    trend?: string;
    trendDirection?: 'up' | 'down';
  };
  secondary: Array<{
    label: string;
    value: string;
    valueColor?: string;
  }>;
  sparkline?: number[];
  customContent?: string;
  customData?: Record<string, unknown>;
}

export interface SettingsField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  prefix?: string;
  suffix?: string;
  options?: { value: string; label: string }[];
  defaultValue: string;
}

export interface ModuleDefinition {
  id: string;
  name: string;
  icon: string;
  route: string;
  services: string[];
  getDashboardMetrics: () => Promise<DashboardMetrics>;
  getTables: () => string[];
  getSettingsFields?: () => SettingsField[];
}

const moduleRegistry: Map<string, ModuleDefinition> = new Map();

export function registerModule(def: ModuleDefinition): void {
  moduleRegistry.set(def.id, def);
}

export function getRegisteredModules(): ModuleDefinition[] {
  return Array.from(moduleRegistry.values());
}

export function getModule(id: string): ModuleDefinition | undefined {
  return moduleRegistry.get(id);
}

// ── Module registrations ──

import { HOUSING_TABLES_SQL } from './modules/housing/tables';
import { DEMO_MODE } from './config';

registerModule({
  id: 'housing',
  name: 'Housing',
  icon: 'Home',
  route: '/housing',
  services: ['RentCast', 'Mapbox', 'Polymarket', 'Kalshi'],
  getDashboardMetrics: async () => {
    // Lazy import to avoid circular dependency (modules.ts <-> db.ts)
    const { getHousingDashboardMetrics } = await import('./modules/housing/dashboard');
    return getHousingDashboardMetrics();
  },
  getTables: () => [HOUSING_TABLES_SQL],
  // Module config (down payment, credit score, city/state, scoring weights)
  // lives inside the housing module's own Budget & Loan panel — not in
  // global Settings. Settings only owns app-level concerns (spend
  // controls, data, module on/off).
});

registerModule({
  id: 'portfolio',
  name: 'Portfolio',
  icon: 'PieChart',
  route: '/portfolio',
  services: ['Finnhub', 'CoinGecko'],
  getDashboardMetrics: async () => {
    if (DEMO_MODE) {
      return {
        primary: { label: 'Net Capital', value: '$847,291' },
        secondary: [
          { label: 'Equities', value: '45%' },
          { label: 'Crypto', value: '20%' },
        ],
        customContent: 'portfolio-donut',
        customData: {
          totalValue: '$847,291',
          segments: [
            { label: 'Stocks', pct: 45, color: '#46f1c5' },
            { label: 'Crypto', pct: 20, color: '#22d3ee' },
            { label: 'Cash', pct: 15, color: '#8b949e' },
            { label: 'Bonds', pct: 10, color: '#3b82f6' },
            { label: 'RE', pct: 7, color: '#f59e0b' },
            { label: 'Other', pct: 3, color: '#ef4444' },
          ],
          equityPct: '45%',
          cryptoPct: '20%',
        },
      };
    }

    // Read cached values that the portfolio page persists after computing
    // with live prices. No recomputation here — single source of truth.
    const { dbGet } = await import('./db');
    const getPref = async (key: string): Promise<string | null> => {
      const row = await dbGet<{ value: string }>('SELECT value FROM user_preferences WHERE key = ?', key);
      return row?.value ?? null;
    };

    const total = await getPref('portfolio.cached_total');
    const equityPct = await getPref('portfolio.cached_equity_pct');
    const cryptoPct = await getPref('portfolio.cached_crypto_pct');
    const segmentsJson = await getPref('portfolio.cached_segments');

    let segments: Array<{ label: string; pct: number; color: string }> = [];
    if (segmentsJson) {
      try { segments = JSON.parse(segmentsJson); } catch {}
    }

    return {
      primary: { label: 'Net Capital', value: total ?? '$—' },
      secondary: [
        { label: 'Equities', value: equityPct ?? '—' },
        { label: 'Crypto', value: cryptoPct ?? '—' },
      ],
      customContent: 'portfolio-donut',
      customData: {
        totalValue: total ?? '$—',
        segments,
        equityPct: equityPct ?? '—',
        cryptoPct: cryptoPct ?? '—',
      },
    };
  },
  getTables: () => [],
});

registerModule({
  id: 'food',
  name: 'Food',
  icon: 'ShoppingBag',
  route: '/food',
  services: ['Thai Kitchen', 'DoorDash'],
  getDashboardMetrics: async () => ({
    primary: {
      label: 'Last Order',
      value: 'Pad Thai',
    },
    secondary: [],
    customContent: 'food-reorder',
  }),
  getTables: () => [],
});

registerModule({
  id: 'fitness-tracker',
  name: 'Fitness Tracker',
  icon: 'Activity',
  route: '/fitness-tracker',
  services: [],
  getDashboardMetrics: async () => {
    const { dbAll } = await import('./db');

    // Get workouts from the last 7 days
    const d = new Date();
    const weekDates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() - i);
      weekDates.push(dd.toLocaleDateString('en-CA'));
    }
    const weekStart = weekDates[0];

    const rows = await dbAll<{ date: string; cnt: number }>(
      `SELECT date, COUNT(*) as cnt FROM fitness_workouts
       WHERE date >= ? GROUP BY date ORDER BY date`,
      weekStart
    );
    const countByDate = new Map(rows.map((r) => [r.date, Number(r.cnt)]));
    const weekTotal = rows.reduce((s, r) => s + Number(r.cnt), 0);
    const sparkline = weekDates.map((d) => countByDate.get(d) ?? 0);

    // Streak
    const streakRows = await dbAll<{ date: string }>(
      'SELECT DISTINCT date FROM fitness_workouts ORDER BY date DESC LIMIT 30'
    );
    const dates = new Set(streakRows.map((r) => r.date));
    let streak = 0;
    const sd = new Date();
    if (!dates.has(sd.toLocaleDateString('en-CA'))) sd.setDate(sd.getDate() - 1);
    while (dates.has(sd.toLocaleDateString('en-CA'))) { streak++; sd.setDate(sd.getDate() - 1); }

    // Last activity
    const last = await dbAll<{ activity: string; date: string }>(
      "SELECT activity, date FROM fitness_workouts WHERE activity != 'split' ORDER BY date DESC, created_at DESC LIMIT 1"
    );
    const lastLabel = last[0] ? last[0].activity : null;

    return {
      primary: {
        label: 'This Week',
        value: weekTotal > 0 ? `${weekTotal} workouts` : '—',
      },
      secondary: [
        { label: 'Streak', value: streak > 0 ? `${streak}d` : '—' },
        { label: 'Last', value: lastLabel ?? '—' },
      ],
      sparkline,
    };
  },
  getTables: () => [],
});

registerModule({
  id: 'reading',
  name: 'Reading',
  icon: 'BookOpen',
  route: '/reading',
  services: [],
  getDashboardMetrics: async () => {
    const { dbAll } = await import('./db');

    // Week boundaries
    const d = new Date();
    const weekDates: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() - i);
      weekDates.push(dd.toLocaleDateString('en-CA'));
    }
    const weekStart = weekDates[0];

    // Pages per day this week (for sparkline)
    const rows = await dbAll<{ date: string; total: number }>(
      `SELECT date, SUM(pages) as total FROM reading_logs
       WHERE date >= ? GROUP BY date ORDER BY date`,
      weekStart
    );
    const pagesByDate = new Map(rows.map((r) => [r.date, Number(r.total)]));
    const sparkline = weekDates.map((d) => pagesByDate.get(d) ?? 0);
    const weekTotal = sparkline.reduce((s, v) => s + v, 0);
    const daysWithData = sparkline.filter((v) => v > 0).length;
    const dailyAvg = daysWithData > 0 ? Math.round(weekTotal / daysWithData) : 0;

    // Streak
    const streakRows = await dbAll<{ date: string }>(
      'SELECT DISTINCT date FROM reading_logs ORDER BY date DESC LIMIT 30'
    );
    const dates = new Set(streakRows.map((r) => r.date));
    let streak = 0;
    const sd = new Date();
    if (!dates.has(sd.toLocaleDateString('en-CA'))) sd.setDate(sd.getDate() - 1);
    while (dates.has(sd.toLocaleDateString('en-CA'))) { streak++; sd.setDate(sd.getDate() - 1); }

    return {
      primary: {
        label: 'This Week',
        value: weekTotal > 0 ? `${weekTotal} pages` : '—',
      },
      secondary: [
        { label: 'Streak', value: streak > 0 ? `${streak}d` : '—' },
        { label: 'Avg', value: dailyAvg > 0 ? `${dailyAvg}/day` : '—' },
      ],
      sparkline,
    };
  },
  getTables: () => [],
});
