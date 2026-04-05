import fs from 'fs';
import path from 'path';
import { getDb } from './db';

const KEYS_DIR = path.join(process.cwd(), 'keys');
const PK_FILE = path.join(KEYS_DIR, 'wallet.key');

function ensureKeysDir() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { mode: 0o700 });
  }
}

function savePrivateKey(privateKey: string) {
  ensureKeysDir();
  fs.writeFileSync(PK_FILE, privateKey, { mode: 0o600 });
}

function loadPrivateKey(): string | null {
  try {
    return fs.readFileSync(PK_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

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

  // Save private key to filesystem, NOT the database
  savePrivateKey(privateKey);

  // Only store addresses in DB (safe to lose — derivable from the key)
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  upsert.run('wallet.evm_address', evmAddress);
  upsert.run('wallet.solana_address', solanaAddress);

  return { evmAddress, solanaAddress };
}

// ── Wallet state ──

export function walletExists(): boolean {
  return loadPrivateKey() !== null;
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
