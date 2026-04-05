'use client';

import { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import BackButton from '@/components/layout/BackButton';

// ── Types ──

interface SettingsField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  prefix?: string;
  suffix?: string;
  options?: { value: string; label: string }[];
  defaultValue: string;
}

interface ModuleInfo {
  id: string;
  name: string;
  services: string[];
  settingsFields: SettingsField[];
}

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
        <Field
          label="City"
          value={prefs.city ?? ''}
          onChange={(v) => onUpdate('city', v)}
        />
        <Field
          label="State"
          value={prefs.state ?? ''}
          onChange={(v) => onUpdate('state', v)}
        />
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
        <Toggle
          label="Auto-pause on empty"
          enabled={prefs.auto_pause_empty === 'true'}
          onToggle={(v) =>
            onUpdate('auto_pause_empty', v ? 'true' : 'false')
          }
        />
      </div>
    </section>
  );
}

// ── Module Settings Card ──

function ModuleSettingsCard({
  mod,
  prefs,
  enabled,
  onToggle,
  onUpdateField,
}: {
  mod: ModuleInfo;
  prefs: Record<string, string>;
  enabled: boolean;
  onToggle: () => void;
  onUpdateField: (key: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasFields = mod.settingsFields.length > 0;

  return (
    <div className="border border-outline bg-surface-container-lowest">
      {/* Header row */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {hasFields ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              {expanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}
          <div>
            <div className="text-sm font-medium text-on-surface">
              {mod.name}
            </div>
            <div className="flex gap-2 mt-1">
              {mod.services.map((s) => (
                <span
                  key={s}
                  className="text-[9px] font-mono text-on-surface-variant px-1.5 py-0.5 border border-outline"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
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

      {/* Expanded settings fields */}
      {expanded && hasFields && (
        <div className="border-t border-outline p-4 bg-surface-container-low">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mod.settingsFields.map((field) => {
              const prefKey = `${mod.id}.${field.key}`;
              const value = prefs[prefKey] ?? field.defaultValue;

              if (field.type === 'select') {
                return (
                  <div key={field.key}>
                    <label className="section-header text-[10px] text-on-surface-variant mb-1 block">
                      {field.label}
                    </label>
                    <select
                      value={value}
                      onChange={(e) =>
                        onUpdateField(prefKey, e.target.value)
                      }
                      className="w-full bg-surface-container-lowest border border-outline text-sm px-3 py-2 text-on-surface focus:border-primary focus:outline-none"
                    >
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              return (
                <Field
                  key={field.key}
                  label={field.label}
                  value={value}
                  onChange={(v) => onUpdateField(prefKey, v)}
                  prefix={field.prefix}
                  suffix={field.suffix}
                  type={field.type}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modules Section ──

function ModulesSection({
  modules,
  prefs,
  enabledMap,
  onToggle,
  onUpdateField,
}: {
  modules: ModuleInfo[];
  prefs: Record<string, string>;
  enabledMap: Record<string, boolean>;
  onToggle: (id: string) => void;
  onUpdateField: (key: string, value: string) => void;
}) {
  return (
    <section className="bg-surface-container-low border border-outline p-6">
      <h2 className="section-header text-sm text-on-surface mb-6">Modules</h2>
      <div className="space-y-3">
        {modules.map((mod) => (
          <ModuleSettingsCard
            key={mod.id}
            mod={mod}
            prefs={prefs}
            enabled={enabledMap[mod.id] ?? true}
            onToggle={() => onToggle(mod.id)}
            onUpdateField={onUpdateField}
          />
        ))}
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
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>({});
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

    fetch('/api/modules')
      .then((r) => r.json())
      .then((data: ModuleInfo[]) => {
        setModules(data);
        const map: Record<string, boolean> = {};
        data.forEach((m) => (map[m.id] = true));
        setEnabledMap(map);
      })
      .catch(() => {});
  }, []);

  function updatePref(key: string, value: string) {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function toggleModule(id: string) {
    setEnabledMap((prev) => ({ ...prev, [id]: !prev[id] }));
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
        <ModulesSection
          modules={modules}
          prefs={prefs}
          enabledMap={enabledMap}
          onToggle={toggleModule}
          onUpdateField={updatePref}
        />
        <DataStorageSection stats={dbStats} />
      </div>
    </>
  );
}
