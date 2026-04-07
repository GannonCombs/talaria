'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import BackButton from '@/components/layout/BackButton';

// ── Types ──

interface DbStats {
  fileSizeFormatted: string;
  totalRows: number;
  rowCounts: Record<string, number>;
}

// ── Shared Field Component ──

function Field({
  label,
  value,
  onChange,
  prefix,
  suffix,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="section-header text-[10px] text-on-surface-variant mb-1 block">
        {label}
      </label>
      <div className="flex items-center gap-1">
        {prefix && (
          <span className="text-on-surface-variant text-sm">{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface font-mono focus:border-primary focus:outline-none"
        />
        {suffix && (
          <span className="text-on-surface-variant text-sm whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  enabled,
  onToggle,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-on-surface">{label}</span>
      <button
        onClick={() => onToggle(!enabled)}
        className={`w-10 h-5 rounded-full relative ${
          enabled ? 'bg-primary' : 'bg-surface-container-highest'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm ${
            enabled ? 'right-0.5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ── General Section ──

function GeneralSection({
  prefs,
  onUpdate,
}: {
  prefs: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}) {
  return (
    <section className="bg-surface-container-low border border-outline p-6">
      <h2 className="section-header text-sm text-on-surface mb-6">General</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field
          label="Name"
          value={prefs.name ?? ''}
          onChange={(v) => onUpdate('name', v)}
        />
      </div>
      <div className="text-[10px] text-on-surface-variant mt-4">
        Module-specific config (location, budget, scoring) lives inside each module.
      </div>
    </section>
  );
}

// ── Spending Controls Section ──

function SpendingControlsSection({
  prefs,
  onUpdate,
}: {
  prefs: Record<string, string>;
  onUpdate: (key: string, value: string) => void;
}) {
  return (
    <section className="bg-surface-container-low border border-outline p-6">
      <h2 className="section-header text-sm text-on-surface mb-6">
        Spending Controls
      </h2>
      <div className="divide-y divide-outline/30">
        <Toggle
          label="Daily spend limit"
          enabled={prefs.daily_spend_limit !== 'null'}
          onToggle={(v) =>
            onUpdate('daily_spend_limit', v ? '50' : 'null')
          }
        />
        <Toggle
          label="Low balance alert"
          enabled={Number(prefs.low_balance_alert) > 0}
          onToggle={(v) =>
            onUpdate('low_balance_alert', v ? '2.00' : '0')
          }
        />
      </div>
    </section>
  );
}

// ── Data & Storage Section ──

function DataStorageSection({ stats }: { stats: DbStats | null }) {
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleClear() {
    setShowConfirm(false);
    await fetch('/api/transactions', { method: 'DELETE' }).catch(() => {});
    window.location.reload();
  }

  return (
    <section className="bg-surface-container-low border border-outline p-6">
      <h2 className="section-header text-sm text-on-surface mb-6">
        Data & Storage
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface-container-lowest border border-outline p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database size={14} className="text-on-surface-variant" />
            <span className="section-header text-[10px] text-on-surface-variant">
              DB Size
            </span>
          </div>
          <span className="font-mono text-lg text-on-surface">
            {stats?.fileSizeFormatted ?? '—'}
          </span>
        </div>
        <div className="bg-surface-container-lowest border border-outline p-4">
          <span className="section-header text-[10px] text-on-surface-variant block mb-2">
            Total Rows
          </span>
          <span className="font-mono text-lg text-on-surface">
            {stats?.totalRows?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="bg-surface-container-lowest border border-outline p-4">
          <span className="section-header text-[10px] text-on-surface-variant block mb-2">
            Tables
          </span>
          <div className="space-y-1">
            {stats?.rowCounts &&
              Object.entries(stats.rowCounts).map(([table, count]) => (
                <div
                  key={table}
                  className="flex justify-between text-[11px]"
                >
                  <span className="text-on-surface-variant font-mono">
                    {table}
                  </span>
                  <span className="text-on-surface font-mono">{count}</span>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button className="flex items-center gap-2 px-4 py-2 border border-outline text-on-surface-variant section-header text-xs hover:bg-surface-bright">
          <Download size={14} />
          Export Database
        </button>

        {!showConfirm ? (
          <button
            onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 border border-error text-error section-header text-xs hover:bg-error/10"
          >
            <Trash2 size={14} />
            Clear All Data
          </button>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2 border border-error bg-error/10">
            <AlertTriangle size={14} className="text-error" />
            <span className="text-error text-xs">
              Delete all transactions?
            </span>
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-error text-on-primary text-xs font-bold"
            >
              Confirm
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1 border border-outline text-on-surface-variant text-xs"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Settings Page ──

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then(setPrefs)
      .catch(() => {});

    fetch('/api/db-stats')
      .then((r) => r.json())
      .then(setDbStats)
      .catch(() => {});
  }, []);

  function updatePref(key: string, value: string) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function save() {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    setDirty(false);
  }

  return (
    <>
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BackButton />
            <h1 className="text-2xl font-bold tracking-tight text-on-surface">
              Settings
            </h1>
          </div>
        </div>
        {dirty && (
          <button
            onClick={save}
            className="px-6 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest hover:opacity-90"
          >
            Save Changes
          </button>
        )}
      </div>

      <div className="space-y-6">
        <GeneralSection prefs={prefs} onUpdate={updatePref} />
        <SpendingControlsSection prefs={prefs} onUpdate={updatePref} />
        <DataStorageSection stats={dbStats} />
      </div>
    </>
  );
}
