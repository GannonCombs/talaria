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
  getSettingsFields: () => [
    { key: 'budget', label: 'Budget', type: 'number', prefix: '$', defaultValue: '550000' },
    { key: 'down_payment_pct', label: 'Down Payment', type: 'number', suffix: '%', defaultValue: '20' },
    { key: 'loan_term_years', label: 'Loan Term', type: 'number', suffix: 'years', defaultValue: '30' },
    {
      key: 'credit_score_tier',
      label: 'Credit Score Tier',
      type: 'select',
      defaultValue: 'excellent',
      options: [
        { value: 'excellent', label: 'Excellent (740+)' },
        { value: 'good', label: 'Good (670-739)' },
        { value: 'fair', label: 'Fair (580-669)' },
        { value: 'poor', label: 'Poor (<580)' },
      ],
    },
  ],
});

registerModule({
  id: 'portfolio',
  name: 'Portfolio',
  icon: 'PieChart',
  route: '/portfolio',
  services: ['Alpha Vantage', 'Kraken'],
  getDashboardMetrics: async () => ({
    primary: {
      label: 'Total Net Capital',
      value: '$1,248,392',
      trend: '+0.8% Δ',
      trendDirection: 'up',
    },
    secondary: [
      { label: 'Equities', value: '70%' },
      { label: 'Crypto', value: '25%' },
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
