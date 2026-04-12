'use client';

import { useState, useEffect } from 'react';

type ApprovalMode = 'none' | 'threshold' | 'always-biometric';

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

async function confirmSecurityChange(action: string): Promise<string | null> {
  try {
    const res = await fetch('/api/security/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json();
    return data.confirmed ? data.token : null;
  } catch {
    return null;
  }
}

export default function SpendingControls() {
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [dailyValue, setDailyValue] = useState('5');
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [alertValue, setAlertValue] = useState('5');

  const [approvalMode, setApprovalMode] = useState<ApprovalMode>('threshold');
  const [maxTransaction, setMaxTransaction] = useState('1.00');
  const [autoApproveUnder, setAutoApproveUnder] = useState('0.05');
  const [dailyTxnCount, setDailyTxnCount] = useState('100');

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

        if (prefs['security.approval_mode']) setApprovalMode(prefs['security.approval_mode']);
        if (prefs['security.max_transaction']) setMaxTransaction(prefs['security.max_transaction']);
        if (prefs['security.auto_approve_under']) setAutoApproveUnder(prefs['security.auto_approve_under']);
        if (prefs['security.daily_txn_count']) setDailyTxnCount(prefs['security.daily_txn_count']);
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

  async function saveSecurityPref(key: string, value: string, requireConfirm = false) {
    if (requireConfirm) {
      const token = await confirmSecurityChange('Disable biometric approval');
      if (!token) return false;
    }
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    return true;
  }

  return (
    <div className="bg-surface-container-low border border-outline p-8">
      <h3 className="section-header text-sm text-on-surface-variant mb-6">
        Spending Controls
      </h3>
      <div className="divide-y divide-outline/30">
        {/* Approval Mode */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1">
            <div className="text-sm text-on-surface font-medium">Approval Mode</div>
            <div className="text-[10px] text-on-surface-variant">
              {approvalMode === 'none' && 'Auto-approve all payments (limits still enforced)'}
              {approvalMode === 'threshold' && 'Auto-approve small amounts, biometric for larger'}
              {approvalMode === 'always-biometric' && 'Touch ID required for every payment'}
            </div>
          </div>
          <select
            value={approvalMode}
            onChange={async (e) => {
              const newMode = e.target.value as ApprovalMode;
              const needsConfirm = approvalMode === 'always-biometric' && newMode !== 'always-biometric';
              const saved = await saveSecurityPref('security.approval_mode', newMode, needsConfirm);
              if (saved) setApprovalMode(newMode);
              else e.target.value = approvalMode; // revert select if denied
            }}
            className="bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface focus:border-primary focus:outline-none"
          >
            <option value="none">None</option>
            <option value="threshold">Threshold</option>
            <option value="always-biometric">Always Biometric</option>
          </select>
        </div>

        {/* Max Transaction */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1">
            <div className="text-sm text-on-surface font-medium">Max Transaction</div>
            <div className="text-[10px] text-on-surface-variant">Hard cap per single API call</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-on-surface-variant text-xs">$</span>
            <input
              type="number"
              value={maxTransaction}
              onChange={(e) => setMaxTransaction(e.target.value)}
              onBlur={() => savePref('security.max_transaction', maxTransaction)}
              className="w-20 bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface font-mono focus:border-primary focus:outline-none text-right"
            />
          </div>
        </div>

        {/* Auto-Approve Threshold (only visible in threshold mode) */}
        {approvalMode === 'threshold' && (
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex-1">
              <div className="text-sm text-on-surface font-medium">Auto-Approve Under</div>
              <div className="text-[10px] text-on-surface-variant">Skip biometric for amounts below this</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-on-surface-variant text-xs">$</span>
              <input
                type="number"
                value={autoApproveUnder}
                onChange={(e) => setAutoApproveUnder(e.target.value)}
                onBlur={() => savePref('security.auto_approve_under', autoApproveUnder)}
                className="w-20 bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface font-mono focus:border-primary focus:outline-none text-right"
              />
            </div>
          </div>
        )}

        {/* Daily Transaction Count */}
        <div className="flex items-center justify-between gap-4 py-3">
          <div className="flex-1">
            <div className="text-sm text-on-surface font-medium">Daily Transaction Limit</div>
            <div className="text-[10px] text-on-surface-variant">Max API calls per day</div>
          </div>
          <input
            type="number"
            value={dailyTxnCount}
            onChange={(e) => setDailyTxnCount(e.target.value)}
            onBlur={() => savePref('security.daily_txn_count', dailyTxnCount)}
            className="w-20 bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface font-mono focus:border-primary focus:outline-none text-right"
          />
        </div>

        {/* Existing: Daily Spend Limit */}
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

        {/* Existing: Low Balance Alert */}
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
