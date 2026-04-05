import { TrendingDown, TrendingUp, BarChart3 } from 'lucide-react';

interface ServiceSpend {
  service: string;
  total: number;
  count: number;
}

interface InsightCardsProps {
  byService: ServiceSpend[];
}

export default function InsightCards({ byService }: InsightCardsProps) {
  const cheapest = byService.length
    ? byService.reduce((a, b) =>
        a.total / a.count < b.total / b.count ? a : b
      )
    : null;

  const mostExpensive = byService.length
    ? byService.reduce((a, b) =>
        a.total / a.count > b.total / b.count ? a : b
      )
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-surface-container-low border border-outline p-4">
        <div className="flex items-center gap-3 mb-3">
          <TrendingDown size={18} className="text-secondary" />
          <h3 className="section-header text-xs text-on-surface">
            Cheapest Module
          </h3>
        </div>
        <div className="flex justify-between items-end">
          <span className="text-xl font-bold tracking-tight">
            {cheapest?.service ?? '—'}
          </span>
          <span className="font-mono text-secondary text-sm">
            {cheapest
              ? `$${(cheapest.total / cheapest.count).toFixed(3)} / req`
              : '—'}
          </span>
        </div>
      </div>

      <div className="bg-surface-container-low border border-outline p-4">
        <div className="flex items-center gap-3 mb-3">
          <TrendingUp size={18} className="text-error" />
          <h3 className="section-header text-xs text-on-surface">
            Most Expensive Module
          </h3>
        </div>
        <div className="flex justify-between items-end">
          <span className="text-xl font-bold tracking-tight">
            {mostExpensive?.service ?? '—'}
          </span>
          <span className="font-mono text-error text-sm">
            {mostExpensive
              ? `$${(mostExpensive.total / mostExpensive.count).toFixed(3)} / req`
              : '—'}
          </span>
        </div>
      </div>

      <div className="bg-surface-container-low border border-outline p-4">
        <div className="flex items-center gap-3 mb-3">
          <BarChart3 size={18} className="text-primary" />
          <h3 className="section-header text-xs text-on-surface">
            Cost Trend
          </h3>
        </div>
        <div className="flex justify-between items-end">
          <span className="text-xl font-bold tracking-tight">
            {byService.length ? 'Efficient' : '—'}
          </span>
          <span className="font-mono text-primary text-sm">
            {byService.length ? 'Tracking' : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}
