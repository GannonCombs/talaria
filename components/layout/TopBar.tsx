'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wallet, Receipt, Info } from 'lucide-react';
import { useCostTracker } from '@/hooks/useCostTracker';
import { useWallet } from '@/hooks/useWallet';
import CostInfoModal from './CostInfoModal';

function getWalletTint(balance: number) {
  if (balance > 10) return 'bg-[#00382b] border-[#00513f]';
  if (balance >= 2) return 'bg-amber-900/20 border-amber-700/30';
  return 'bg-red-900/20 border-red-700/30';
}

export default function TopBar() {
  const { today } = useCostTracker();
  const { totalUsd } = useWallet();
  const [costInfoOpen, setCostInfoOpen] = useState(false);
  const pathname = usePathname();

  // Derive module ID from the current route (e.g. /housing → 'housing')
  const moduleId = ['housing', 'portfolio', 'food', 'fitness-tracker']
    .find((m) => pathname.startsWith(`/${m}`));

  return (
    <>
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
              className={`flex items-center gap-2 px-3 py-1 rounded-full border ${getWalletTint(totalUsd)}`}
            >
              <Wallet size={16} className="text-primary" />
              <span className="font-mono text-xs font-bold text-primary">
                ${totalUsd.toFixed(2)}
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

            {/* Cost info button — opens a modal explaining every action
                in the app that costs money. */}
            <button
              onClick={() => setCostInfoOpen(true)}
              className="p-1 text-on-surface-variant hover:text-primary transition-colors"
              aria-label="Understanding the costs of this app"
              title="Understanding the costs of this app"
            >
              <Info size={16} />
            </button>
          </div>
        </div>
      </header>

      <CostInfoModal open={costInfoOpen} onClose={() => setCostInfoOpen(false)} moduleId={moduleId} />
    </>
  );
}
