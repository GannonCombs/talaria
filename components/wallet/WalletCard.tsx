'use client';

import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { getBalanceHealth } from '@/lib/wallet';

interface WalletCardProps {
  balance: number;
  address: string;
  network: string;
}

const HEALTH_COLORS = {
  healthy: { bar: 'bg-secondary', text: 'text-secondary', label: 'Healthy' },
  low: { bar: 'bg-tertiary-container', text: 'text-tertiary-container', label: 'Low' },
  critical: { bar: 'bg-error', text: 'text-error', label: 'Critical' },
};

export default function WalletCard({
  balance,
  address,
  network,
}: WalletCardProps) {
  const [copied, setCopied] = useState(false);
  const health = getBalanceHealth(balance);
  const colors = HEALTH_COLORS[health];

  const healthPct = Math.min(100, (balance / 20) * 100);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-surface-container-low border border-outline p-6">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full bg-primary" />
        <span className="section-header text-[10px] text-primary">
          Tempo Wallet
        </span>
      </div>
      <div className="text-[10px] text-on-surface-variant font-mono mb-4">
        {network}
      </div>

      {/* Balance */}
      <div className="font-mono text-4xl font-bold text-primary tracking-tighter mb-1">
        ${balance.toFixed(2)}
      </div>
      <div className="text-[10px] text-on-surface-variant font-mono uppercase mb-6">
        Available Liquidity
      </div>

      {/* Health Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="section-header text-[10px] text-on-surface-variant">
            Balance Health
          </span>
          <span className={`section-header text-[10px] ${colors.text}`}>
            {colors.label}
          </span>
        </div>
        <div className="h-1.5 bg-surface-container-highest w-full">
          <div
            className={`h-full ${colors.bar}`}
            style={{ width: `${healthPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-on-surface-variant font-mono">
            LB Threshold: $2.00
          </span>
          <span className="text-[9px] text-on-surface-variant font-mono">
            $20.00
          </span>
        </div>
      </div>

      {/* Address */}
      <div className="flex items-center gap-2">
        <span className="section-header text-[10px] text-on-surface-variant">
          Addr:
        </span>
        <span className="font-mono text-[10px] text-on-surface">
          {address}
        </span>
        <button
          onClick={handleCopy}
          className="text-on-surface-variant hover:text-primary"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}
