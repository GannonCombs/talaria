'use client';

import { useState, useEffect } from 'react';

interface ControlRowProps {
  label: string;
  description: string;
  enabled: boolean;
  value: string;
  onToggle: (v: boolean) => void;
  onValueChange: (v: string) => void;
}

function ControlRow({
  label,
  description,
  enabled,
  value,
  onToggle,
  onValueChange,
}: ControlRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex-1">
        <div className="text-sm text-on-surface font-medium">{label}</div>
        <div className="text-[10px] text-on-surface-variant">{description}</div>
      </div>
      <div className="flex items-center gap-3">
        {enabled && (
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant text-xs">$</span>
            <input
              type="number"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-20 bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface font-mono focus:border-primary focus:outline-none text-right"
            />
          </div>
        )}
        <button
          onClick={() => onToggle(!enabled)}
          className={`w-10 h-5 rounded-full relative shrink-0 ${
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
    </div>
  );
}

export default function SpendingControls() {
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [dailyValue, setDailyValue] = useState('50');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertValue, setAlertValue] = useState('5');

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefs) => {
        const limit = prefs.daily_spend_limit;
        setDailyEnabled(limit !== 'null' && limit !== undefined);
        if (limit && limit !== 'null') setDailyValue(limit);

        const alert = prefs.low_balance_alert;
        setAlertEnabled(Number(alert) > 0);
        if (alert && Number(alert) > 0) setAlertValue(alert);
      })
      .catch(() => {});
  }, []);

  function savePref(key: string, value: string) {
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  }

  return (
    <div className="bg-surface-container-low border border-outline p-8">
      <h3 className="section-header text-sm text-on-surface-variant mb-6">
        Spending Controls
      </h3>
      <div className="divide-y divide-outline/30">
        <ControlRow
          label="Daily Spend Limit"
          description="Max USD spend per day across all modules"
          enabled={dailyEnabled}
          value={dailyValue}
          onToggle={(v) => {
            setDailyEnabled(v);
            savePref('daily_spend_limit', v ? dailyValue : 'null');
          }}
          onValueChange={(v) => {
            setDailyValue(v);
            savePref('daily_spend_limit', v);
          }}
        />
        <ControlRow
          label="Low Balance Alert"
          description="Notify when wallet balance drops below threshold"
          enabled={alertEnabled}
          value={alertValue}
          onToggle={(v) => {
            setAlertEnabled(v);
            savePref('low_balance_alert', v ? alertValue : '0');
          }}
          onValueChange={(v) => {
            setAlertValue(v);
            savePref('low_balance_alert', v);
          }}
        />
      </div>
    </div>
  );
}
