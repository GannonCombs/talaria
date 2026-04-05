'use client';

import BackButton from '@/components/layout/BackButton';
import { useWallet } from '@/hooks/useWallet';
import Holdings from '@/components/wallet/Holdings';
import FundWallet from '@/components/wallet/FundWallet';
import SpendingControls from '@/components/wallet/SpendingControls';

export default function WalletPage() {
  const {
    exists,
    totalUsd,
    evmAddress,
    evmAddressFull,
    solanaAddress,
    solanaAddressFull,
    evmBalances,
    solanaBalances,
    linkedAccounts,
    refresh,
  } = useWallet();

  async function handleCreateWallet() {
    await fetch('/api/wallet', { method: 'POST' });
    await refresh();
  }

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Wallet
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 mb-6 items-stretch">
        <Holdings
          exists={exists}
          totalUsd={totalUsd}
          evmAddress={evmAddress}
          evmAddressFull={evmAddressFull}
          solanaAddress={solanaAddress}
          solanaAddressFull={solanaAddressFull}
          evmBalances={evmBalances}
          solanaBalances={solanaBalances}
          linkedAccounts={linkedAccounts}
          onCreateWallet={handleCreateWallet}
        />

        <div className="space-y-6">
          <FundWallet />
          <SpendingControls />
        </div>
      </div>
    </>
  );
}
