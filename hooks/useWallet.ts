'use client';

import { useState, useEffect, useCallback } from 'react';

interface WalletState {
  balance: number;
  address: string;
  network: string;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    balance: 0,
    address: '',
    network: '',
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
