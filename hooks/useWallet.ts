'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChainBalance, LinkedAccount } from '@/lib/wallet';

interface WalletState {
  exists: boolean;
  evmAddress: string;
  evmAddressFull: string;
  solanaAddress: string;
  solanaAddressFull: string;
  totalUsd: number;
  evmBalances: ChainBalance[];
  solanaBalances: ChainBalance[];
  linkedAccounts: LinkedAccount[];
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    exists: false,
    evmAddress: '',
    evmAddressFull: '',
    solanaAddress: '',
    solanaAddressFull: '',
    totalUsd: 0,
    evmBalances: [],
    solanaBalances: [],
    linkedAccounts: [],
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet');
      if (res.ok) {
        setWallet(await res.json());
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...wallet, refresh };
}
