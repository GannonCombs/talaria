'use client';

import { useState, useEffect } from 'react';

interface ToggleProps {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

function Toggle({ label, enabled, onToggle }: ToggleProps) {
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

export default function SpendingControls() {
  const [dailyLimit, setDailyLimit] = useState(false);
  const [lowAlert, setLowAlert] = useState(true);
  const [autoPause, setAutoPause] = useState(true);

  useEffect(() => {
    fetch('/api/preferences')
      .then((r) => r.json())
      .then((prefs) => {
        setDailyLimit(prefs.daily_spend_limit !== 'null');
        setLowAlert(Number(prefs.low_balance_alert) > 0);
        setAutoPause(prefs.auto_pause_empty === 'true');
      })
      .catch(() => {});
  }, []);

  function updatePref(key: string, value: string) {
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
  }

  return (
    <div className="bg-surface-container-low border border-outline p-5">
      <h3 className="section-header text-xs text-on-surface-variant mb-4">
        Spending Controls
      </h3>
      <div className="divide-y divide-outline/30">
        <Toggle
          label="Daily spend limit"
          enabled={dailyLimit}
          onToggle={(v) => {
            setDailyLimit(v);
            updatePref('daily_spend_limit', v ? '50' : 'null');
          }}
        />
        <Toggle
          label="Low balance alert"
          enabled={lowAlert}
          onToggle={(v) => {
            setLowAlert(v);
            updatePref('low_balance_alert', v ? '2.00' : '0');
          }}
        />
        <Toggle
          label="Auto-pause on empty"
          enabled={autoPause}
          onToggle={(v) => {
            setAutoPause(v);
            updatePref('auto_pause_empty', v ? 'true' : 'false');
          }}
        />
      </div>
    </div>
  );
}
