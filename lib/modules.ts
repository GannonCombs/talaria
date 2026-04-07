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
  services: ['Alpha Vantage', 'Kraken'],
  getDashboardMetrics: async () => ({
    primary: {
      label: 'Net Capital',
      value: DEMO_MODE ? '$1,248,392' : '$—',
      trend: DEMO_MODE ? '+0.8% Δ' : undefined,
      trendDirection: DEMO_MODE ? ('up' as const) : undefined,
    },
    secondary: [
      { label: 'Equities', value: DEMO_MODE ? '70%' : '—' },
      { label: 'Crypto', value: DEMO_MODE ? '25%' : '—' },
    ],
    customContent: 'portfolio-donut',
  }),
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
