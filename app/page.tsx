import {
  Activity,
  BookOpen,
  Home,
  PieChart,
  ShoppingBag,
  RefreshCw,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import ModuleCard from '@/components/dashboard/ModuleCard';
import AddModuleCard from '@/components/dashboard/AddModuleCard';
import TransactionTable, {
  type Transaction,
} from '@/components/dashboard/TransactionTable';
import { getRegisteredModules, type DashboardMetrics } from '@/lib/modules';
import { dbGet, dbAll } from '@/lib/db';


// Force dynamic rendering — dashboard reads live DB data
export const dynamic = 'force-dynamic';

// ── Icon resolver ──
const ICON_MAP: Record<string, LucideIcon> = {
  Activity,
  BookOpen,
  Home,
  PieChart,
  ShoppingBag,
};

// ── Custom content components (keyed by DashboardMetrics.customContent) ──

function PortfolioDonut({ data }: { data?: Record<string, unknown> }) {
  const totalValue = (data?.totalValue as string) ?? '$—';
  const segments = (data?.segments as Array<{ label: string; pct: number; color: string }>) ?? [];

  let offset = 0;

  return (
    <div className="flex items-center gap-6 my-2">
      <div className="relative w-16 h-16">
        <svg
          className="w-full h-full transform -rotate-90"
          viewBox="0 0 36 36"
        >
          <circle
            className="stroke-outline"
            cx="18"
            cy="18"
            fill="none"
            r="16"
            strokeWidth="4"
          />
          {segments.map((seg) => {
            const el = (
              <circle
                key={seg.label}
                cx="18"
                cy="18"
                fill="none"
                r="16"
                stroke={seg.color}
                strokeDasharray={`${seg.pct} 100`}
                strokeDashoffset={-offset}
                strokeWidth="4"
              />
            );
            offset += seg.pct;
            return el;
          })}
        </svg>
      </div>
      <div>
        <div className="font-mono text-2xl font-bold text-white tracking-tighter">
          {totalValue}
        </div>
        <div className="text-[10px] text-on-surface-variant font-mono uppercase">
          Total Net Capital
        </div>
      </div>
    </div>
  );
}

function PortfolioSecondaryMetrics({ data }: { data?: Record<string, unknown> }) {
  const equityPct = (data?.equityPct as string) ?? '—';
  const cryptoPct = (data?.cryptoPct as string) ?? '—';

  return (
    <div className="grid grid-cols-2 gap-3 mt-2">
      <div className="bg-background p-2 border border-outline">
        <div className="text-[9px] text-on-surface-variant section-header">
          Equities
        </div>
        <div className="font-mono text-xs text-white">{equityPct}</div>
      </div>
      <div className="bg-background p-2 border border-outline">
        <div className="text-[9px] text-on-surface-variant section-header">
          Crypto
        </div>
        <div className="font-mono text-xs text-white">{cryptoPct}</div>
      </div>
    </div>
  );
}

function FoodCardContent() {
  return (
    <>
      <div className="bg-background border border-outline p-4 my-2">
        <div className="text-[10px] text-on-surface-variant font-mono uppercase mb-1">
          Last Order // Mar 28
        </div>
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm font-bold text-white tracking-tight">
              Pad Thai
            </div>
            <div className="text-[10px] text-primary font-mono">
              Thai Kitchen
            </div>
          </div>
          <UtensilsCrossed size={20} className="text-on-surface-variant" />
        </div>
      </div>
      <button className="w-full h-10 border border-primary text-primary hover:bg-primary hover:text-background transition-all text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
        <RefreshCw size={16} />
        Quick Reorder
      </button>
    </>
  );
}

function renderCustomContent(key: string, data?: Record<string, unknown>): React.ReactNode {
  switch (key) {
    case 'portfolio-donut':
      return (
        <>
          <PortfolioDonut data={data} />
          <PortfolioSecondaryMetrics data={data} />
        </>
      );
    case 'food-reorder':
      return <FoodCardContent />;
    default:
      return null;
  }
}

// ── Dashboard page ──

async function getPref(key: string): Promise<string> {
  const row = await dbGet<{ value: string }>(
    'SELECT value FROM user_preferences WHERE key = ?', key
  );
  return row?.value ?? '';
}

async function getRecentTransactions(): Promise<Transaction[]> {
  const rows = await dbAll<{
    id: number;
    timestamp: string;
    service: string;
    module: string;
    rail: string;
    cost_usd: number;
    metadata: string | null;
  }>(
    'SELECT id, timestamp, service, module, rail, cost_usd, metadata FROM mpp_transactions ORDER BY timestamp DESC LIMIT 10'
  );

  return rows.map((r) => {
    let via: string | undefined;
    if (r.metadata) {
      try { via = JSON.parse(r.metadata).via; } catch { /* ignore */ }
    }
    return {
      id: r.id,
      timestamp: r.timestamp,
      service: r.service,
      module: r.module,
      rail: r.rail,
      via,
      status: 'success' as const,
      costUsd: r.cost_usd,
    };
  });
}

export default async function Dashboard() {
  const name = await getPref('name');
  const city = await getPref('city');
  const state = await getPref('state');

  const modules = getRegisteredModules();

  const moduleCards = await Promise.all(
    modules.map(async (mod) => {
      const metrics: DashboardMetrics = await mod.getDashboardMetrics();
      return {
        id: mod.id,
        name: mod.name,
        icon: ICON_MAP[mod.icon] ?? Home,
        route: mod.route,
        metrics,
      };
    })
  );

  const transactions = await getRecentTransactions();

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase">
          Dashboard
        </h1>
        <p className="font-mono text-[10px] text-on-surface-variant uppercase tracking-widest">
          {name} // {city}, {state}
        </p>
      </div>

      {/* Module Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {moduleCards.map((mod) => (
          <ModuleCard
            key={mod.id}
            id={mod.id}
            name={mod.name}
            icon={mod.icon}
            href={mod.route}
            primaryMetric={
              mod.metrics.customContent
                ? undefined
                : {
                    value: mod.metrics.primary.value,
                    label: mod.metrics.primary.label,
                    trend: mod.metrics.primary.trend,
                    trendDirection: mod.metrics.primary.trendDirection,
                  }
            }
            secondaryMetrics={
              mod.metrics.customContent
                ? undefined
                : mod.metrics.secondary
            }
            sparkline={
              mod.metrics.customContent
                ? undefined
                : mod.metrics.sparkline
            }
            customContent={
              mod.metrics.customContent
                ? renderCustomContent(mod.metrics.customContent, mod.metrics.customData)
                : undefined
            }
          />
        ))}

        <AddModuleCard />
      </div>

      {/* Transaction Table — live from DB */}
      <TransactionTable transactions={transactions} />
    </>
  );
}
