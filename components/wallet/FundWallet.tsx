'use client';

import { ArrowDownToLine, CreditCard, Landmark, ArrowRightLeft } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

export default function FundWallet() {
  const { evmAddressFull } = useWallet();
  const depositUrl = evmAddressFull
    ? `https://agentcash.dev/deposit/${evmAddressFull}`
    : 'https://agentcash.dev';

  return (
    <div className="bg-surface-container-low border border-outline p-8">
      <h3 className="section-header text-sm text-on-surface-variant mb-6">
        Fund Wallet
      </h3>
      <div className="space-y-4">
        <a
          href={depositUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left block"
        >
          <CreditCard size={20} className="shrink-0" />
          <div>
            <div className="text-base font-medium">Card or Bank</div>
            <div className="text-sm text-on-surface-variant">
              Buy USDC with a card or bank account
            </div>
          </div>
        </a>
        <a
          href={depositUrl + '?network=tempo'}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left block"
        >
          <ArrowDownToLine size={20} className="shrink-0" />
          <div>
            <div className="text-base font-medium">Deposit Crypto</div>
            <div className="text-sm text-on-surface-variant">
              Send USDC to your wallet address
            </div>
          </div>
        </a>
        <a
          href={depositUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center gap-4 p-5 border border-outline text-on-surface hover:border-primary hover:text-primary text-left block"
        >
          <ArrowRightLeft size={20} className="shrink-0" />
          <div>
            <div className="text-base font-medium">Bridge</div>
            <div className="text-sm text-on-surface-variant">
              Move USDC between Base, Tempo, and Solana
            </div>
          </div>
        </a>
      </div>
    </div>
  );
}
