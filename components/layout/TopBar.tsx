'use client';

import Link from 'next/link';
import { Wallet, Receipt } from 'lucide-react';
import { useCostTracker } from '@/hooks/useCostTracker';
import { useWallet } from '@/hooks/useWallet';

function getWalletTint(balance: number) {
  if (balance > 10) return 'bg-[#00382b] border-[#00513f]';
  if (balance >= 2) return 'bg-amber-900/20 border-amber-700/30';
  return 'bg-red-900/20 border-red-700/30';
}

export default function TopBar() {
  const { today } = useCostTracker();
  const { balance } = useWallet();

  return (
    <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-14 bg-background border-b border-outline">
      <div className="flex items-center">
        <span className="text-xl font-black tracking-tighter text-primary uppercase">
          TALARIA
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* Wallet Pill — live from API */}
          <Link
            href="/wallet"
            className={`flex items-center gap-2 px-3 py-1 rounded-full border ${getWalletTint(balance)}`}
          >
            <Wallet size={16} className="text-primary" />
            <span className="font-mono text-xs font-bold text-primary">
              ${balance.toFixed(2)}
            </span>
          </Link>

          <div className="h-4 w-[1px] bg-outline mx-1" />

          {/* Cost Pill — live from DB */}
          <Link
            href="/cost-analytics"
            className="flex items-center gap-2 px-3 py-1 bg-surface-container border border-outline rounded-full"
          >
            <Receipt size={16} className="text-on-surface-variant" />
            <span className="font-mono text-xs font-bold text-white">
              ${today.toFixed(2)} TODAY
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
