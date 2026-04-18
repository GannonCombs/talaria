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
  getDashboardMetrics: async () => ({
    primary: {
      label: 'Fitness Tracker',
      value: '—',
    },
    secondary: [],
  }),
  getTables: () => [],
});

registerModule({
  id: 'reading',
  name: 'Reading',
  icon: 'BookOpen',
  route: '/reading',
  services: [],
  getDashboardMetrics: async () => {
    const today = new Date().toISOString().split('T')[0];
    const { dbGet, dbAll } = await import('./db');
    const row = await dbGet<{ total: number }>(
      "SELECT COALESCE(SUM(pages), 0) as total FROM reading_logs WHERE date = ?",
      today
    );
    const todayPages = row?.total ?? 0;

    const streakRow = await dbAll<{ date: string }>(
      "SELECT DISTINCT date FROM reading_logs ORDER BY date DESC LIMIT 30"
    );
    // Count consecutive days from today/yesterday backward
    let streak = 0;
    const dates = new Set(streakRow.map(r => r.date));
    const d = new Date();
    // If nothing logged today, start checking from yesterday
    if (!dates.has(d.toISOString().split('T')[0])) {
      d.setDate(d.getDate() - 1);
    }
    while (dates.has(d.toISOString().split('T')[0])) {
      streak++;
      d.setDate(d.getDate() - 1);
    }

    return {
      primary: {
        label: 'Pages Today',
        value: todayPages > 0 ? `${todayPages}` : '—',
      },
      secondary: [
        { label: 'Streak', value: streak > 0 ? `${streak}d` : '—' },
      ],
    };
  },
  getTables: () => [],
});
