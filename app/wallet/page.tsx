'use client';

import BackButton from '@/components/layout/BackButton';
import { useWallet } from '@/hooks/useWallet';
import WalletCard from '@/components/wallet/WalletCard';
import FundingChannels from '@/components/wallet/FundingChannels';
import RecentActivity from '@/components/wallet/RecentActivity';
import PaymentMethods from '@/components/wallet/PaymentMethods';
import SpendingControls from '@/components/wallet/SpendingControls';

export default function WalletPage() {
  const { balance, address, network } = useWallet();

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Wallet
          </h1>
        </div>
      </div>

      {/* Top row: Wallet Card + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <WalletCard balance={balance} address={address} network={network} />
        <RecentActivity />
      </div>

      {/* Middle row: Funding Channels */}
      <div className="mb-6">
        <FundingChannels />
      </div>

      {/* Bottom row: Payment Methods + Spending Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PaymentMethods />
        <SpendingControls />
      </div>
    </>
  );
}
