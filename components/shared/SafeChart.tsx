'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';

// Defers rendering of Recharts ResponsiveContainer children until the
// parent container has positive dimensions. Recharts measures the parent
// on mount and logs a noisy warning when width/height are <= 0, which
// happens during page transitions and initial flex/grid layout settling.
//
// Usage: wrap your <ResponsiveContainer> in <SafeChart className="h-16">
//        instead of <div className="h-16">.

interface SafeChartProps {
  children: ReactNode;
  className?: string;
}

export default function SafeChart({ children, className }: SafeChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check immediately — if already laid out, no need to wait
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setReady(true);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setReady(true);
          observer.disconnect();
          return;
        }
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {ready ? children : null}
    </div>
  );
}
