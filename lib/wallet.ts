export interface WalletInfo {
  balance: number;
  address: string;
  network: string;
}

export type BalanceHealth = 'healthy' | 'low' | 'critical';

// Phase 1: hardcoded balance. Phase 2 will shell out to `tempo wallet balance`
// or query the Tempo RPC endpoint for live USDC balance.
export async function getWalletBalance(): Promise<WalletInfo> {
  return {
    balance: 12.43,
    address: '0x7a3b...4f2e',
    network: 'Tempo Mainnet',
  };
}

export function getBalanceHealth(balance: number): BalanceHealth {
  if (balance > 10) return 'healthy';
  if (balance >= 2) return 'low';
  return 'critical';
}
