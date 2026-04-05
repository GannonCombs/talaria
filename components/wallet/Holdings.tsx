'use client';

import { useState } from 'react';
import { Copy, Check, CreditCard, Landmark, CircleCheck, Plus } from 'lucide-react';
import type { ChainBalance, LinkedAccount } from '@/lib/wallet';
import { RailIcon } from '@/components/shared/PaymentIcons';

interface HoldingsProps {
  exists: boolean;
  totalUsd: number;
  evmAddress: string;
  evmAddressFull: string;
  solanaAddress: string;
  solanaAddressFull: string;
  evmBalances: ChainBalance[];
  solanaBalances: ChainBalance[];
  linkedAccounts: LinkedAccount[];
  onCreateWallet: () => Promise<void>;
}

function CopyableAddress({ label, address, copyValue }: { label: string; address: string; copyValue: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(copyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="section-header text-sm text-on-surface-variant">
        {label}
      </span>
      <span className="font-mono text-base text-on-surface">{address}</span>
      <button
        onClick={handleCopy}
        className="text-on-surface-variant hover:text-primary"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function groupByChain(balances: ChainBalance[]): Map<string, ChainBalance[]> {
  const map = new Map<string, ChainBalance[]>();
  for (const b of balances) {
    const list = map.get(b.chain) ?? [];
    list.push(b);
    map.set(b.chain, list);
  }
  return map;
}

function ChainGroup({ chain, balances }: { chain: string; balances: ChainBalance[] }) {
  return (
    <>
      {balances.map((b, i) => (
        <div
          key={`${b.chain}-${b.symbol}`}
          className="flex items-center justify-between py-4 px-5"
        >
          <div className="flex items-center gap-3 w-28">
            {i === 0 ? (
              <>
                <RailIcon rail={chain} />
                <span className="text-base text-on-surface capitalize">{chain}</span>
              </>
            ) : (
              <span className="text-on-surface-variant text-base ml-2">–</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="font-mono text-base text-on-surface-variant">
              {b.symbol}
            </span>
            <span className="font-mono text-base text-on-surface font-bold w-20 text-right">
              ${b.usdValue.toFixed(2)}
            </span>
          </div>
        </div>
      ))}
    </>
  );
}

export default function Holdings({
  exists,
  totalUsd,
  evmAddress,
  evmAddressFull,
  solanaAddress,
  solanaAddressFull,
  evmBalances,
  solanaBalances,
  linkedAccounts,
  onCreateWallet,
}: HoldingsProps) {
  const [creating, setCreating] = useState(false);
  const evmGroups = groupByChain(evmBalances);
  const solanaGroups = groupByChain(solanaBalances);

  async function handleCreate() {
    setCreating(true);
    try {
      await onCreateWallet();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bg-surface-container-low border border-outline p-8 h-full">
      {/* Total balance */}
      <div className="flex justify-between items-end mb-10">
        <h3 className="section-header text-sm text-on-surface-variant">
          Total Balance
        </h3>
        <span className="font-mono text-5xl font-bold text-primary tracking-tighter">
          ${totalUsd.toFixed(2)}
        </span>
      </div>

      {!exists ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="text-on-surface-variant text-sm mb-6">
            No wallet yet
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="h-12 px-8 bg-primary text-on-primary text-sm font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={16} />
            {creating ? 'Creating...' : 'Add Wallet'}
          </button>
        </div>
      ) : (
        <>
          {evmBalances.length > 0 && (
            <div className="mb-6">
              <CopyableAddress label="EVM" address={evmAddress} copyValue={evmAddressFull} />
              <div className="border border-outline divide-y divide-outline/30">
                {[...evmGroups.entries()].map(([chain, balances]) => (
                  <ChainGroup key={chain} chain={chain} balances={balances} />
                ))}
              </div>
            </div>
          )}

          {solanaBalances.length > 0 && (
            <div className="mb-6">
              <CopyableAddress label="Solana" address={solanaAddress} copyValue={solanaAddressFull} />
              <div className="border border-outline divide-y divide-outline/30">
                {[...solanaGroups.entries()].map(([chain, balances]) => (
                  <ChainGroup key={chain} chain={chain} balances={balances} />
                ))}
              </div>
            </div>
          )}

          {linkedAccounts.length > 0 && (
            <div>
              <h3 className="section-header text-sm text-on-surface-variant block mb-3">
                Linked Accounts
              </h3>
              <div className="space-y-3">
                {linkedAccounts.map((acct) => (
                  <div
                    key={acct.label}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-3">
                      {acct.type === 'card' ? (
                        <CreditCard size={18} className="text-on-surface-variant" />
                      ) : (
                        <Landmark size={18} className="text-on-surface-variant" />
                      )}
                      <span className="text-base text-on-surface">{acct.label}</span>
                    </div>
                    <CircleCheck size={16} className="text-secondary" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
