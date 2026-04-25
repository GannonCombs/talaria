import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface SecondaryMetric {
  label: string;
  value: string;
  valueColor?: string;
}

interface ModuleCardProps {
  id: string;
  name: string;
  icon: LucideIcon;
  href: string;
  primaryMetric?: {
    value: string;
    label: string;
    trend?: string;
    trendDirection?: 'up' | 'down';
  };
  secondaryMetrics?: SecondaryMetric[];
  sparkline?: number[];
  customContent?: React.ReactNode;
}

function Sparkline({ data, direction }: { data: number[]; direction?: 'up' | 'down' }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 20;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  const color = direction === 'down' ? '#f87171' : '#67df70';

  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ModuleCard({
  name,
  icon: Icon,
  href,
  primaryMetric,
  secondaryMetrics,
  sparkline,
  customContent,
}: ModuleCardProps) {
  return (
    <Link href={href}>
      <div className="group h-[220px] bg-surface border border-outline p-5 flex flex-col justify-between hover:shadow-[inset_0_0_0_2px_#46f1c5,0_0_12px_rgba(70,241,197,0.15)]">
        {/* Top row: icon + name */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <Icon size={20} className="text-primary" />
            <span className="section-header text-xs text-on-surface-variant group-hover:text-white">
              {name}
            </span>
          </div>
        </div>

        {/* Primary metric or custom content */}
        {primaryMetric && !customContent && (
          <div className="my-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="font-mono text-3xl font-bold text-white tracking-tighter whitespace-nowrap">
                  {primaryMetric.value}
                </span>
                {primaryMetric.trend && (
                  <span
                    className="font-mono text-xs ml-2"
                    style={{ color: primaryMetric.trendDirection === 'down' ? '#f87171' : '#67df70' }}
                  >
                    {primaryMetric.trend}
                  </span>
                )}
              </div>
              {sparkline && <Sparkline data={sparkline} direction={primaryMetric.trendDirection} />}
            </div>
            <div className="text-[10px] text-on-surface-variant font-mono uppercase mt-1">
              {primaryMetric.label}
            </div>
          </div>
        )}

        {customContent}

        {/* Secondary metrics — two-column grid, label top, value bottom */}
        {secondaryMetrics && secondaryMetrics.length > 0 && (
          <div className={`grid gap-4 border-t border-outline/50 pt-3 ${secondaryMetrics.length > 2 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {secondaryMetrics.map((m) => (
              <div key={m.label}>
                <span className="section-header text-[9px] text-on-surface-variant block">
                  {m.label}
                </span>
                <span className={`font-mono text-base font-bold ${m.valueColor || 'text-white'}`}>
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
