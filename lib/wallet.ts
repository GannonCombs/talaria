import { getDb } from './db';

export interface ChainBalance {
  chain: string;
  symbol: string;
  balance: number;
  usdValue: number;
}

export interface LinkedAccount {
  type: 'card' | 'bank';
  label: string;
}

export interface WalletInfo {
  exists: boolean;
  evmAddress: string;
  solanaAddress: string;
  totalUsd: number;
  evmBalances: ChainBalance[];
  solanaBalances: ChainBalance[];
  linkedAccounts: LinkedAccount[];
}

// ── Wallet creation ──

interface CreateWalletResult {
  evmAddress: string;
  solanaAddress: string;
}

export async function createWallet(): Promise<CreateWalletResult> {
  const { ethers } = await import('ethers');
  const crypto = await import('crypto');

  const wallet = ethers.Wallet.createRandom();
  const privateKey = wallet.privateKey;
  const evmAddress = wallet.address;

  // Derive Solana address from same entropy (different curve)
  const solanaBytes = crypto.createHash('sha256').update(privateKey).digest();
  const solanaAddress = 'So' + solanaBytes.subarray(0, 16).toString('hex');

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  upsert.run('wallet.private_key', privateKey);
  upsert.run('wallet.evm_address', evmAddress);
  upsert.run('wallet.solana_address', solanaAddress);

  return { evmAddress, solanaAddress };
}

// ── Wallet state ──

export function walletExists(): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'wallet.evm_address'")
    .get() as { value: string } | undefined;
  return !!row?.value;
}

function getStoredAddresses(): { evmAddress: string; solanaAddress: string } {
  const db = getDb();
  const evm = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'wallet.evm_address'")
    .get() as { value: string } | undefined;
  const sol = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'wallet.solana_address'")
    .get() as { value: string } | undefined;

  return {
    evmAddress: evm?.value ?? '',
    solanaAddress: sol?.value ?? '',
  };
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function getWalletBalance(): Promise<WalletInfo> {
  if (!walletExists()) {
    return {
      exists: false,
      evmAddress: '',
      solanaAddress: '',
      totalUsd: 0,
      evmBalances: [],
      solanaBalances: [],
      linkedAccounts: [],
    };
  }

  const { evmAddress, solanaAddress } = getStoredAddresses();

  // Phase 2 will query on-chain balances via RPC.
  // For now, all balances are zero until funded.
  const evmBalances: ChainBalance[] = [
    { chain: 'tempo', symbol: 'USDC', balance: 0, usdValue: 0 },
    { chain: 'base', symbol: 'USDC', balance: 0, usdValue: 0 },
  ];

  const solanaBalances: ChainBalance[] = [
    { chain: 'solana', symbol: 'SOL', balance: 0, usdValue: 0 },
  ];

  return {
    exists: true,
    evmAddress: truncateAddress(evmAddress),
    solanaAddress: truncateAddress(solanaAddress),
    totalUsd: 0,
    evmBalances,
    solanaBalances,
    linkedAccounts: [],
  };
}
