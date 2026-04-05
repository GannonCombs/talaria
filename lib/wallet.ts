import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
  evmAddressFull: string;
  solanaAddress: string;
  solanaAddressFull: string;
  totalUsd: number;
  evmBalances: ChainBalance[];
  solanaBalances: ChainBalance[];
  linkedAccounts: LinkedAccount[];
}

interface CreateWalletResult {
  evmAddress: string;
  solanaAddress: string;
}

// Derive a Solana Ed25519 keypair deterministically from the EVM private key.
// Uses HKDF to derive 32 bytes of Ed25519 seed from the secp256k1 key.
function deriveSolanaKeypair(evmPrivateKey: string) {
  const ikm = Buffer.from(evmPrivateKey.replace('0x', ''), 'hex');
  const salt = Buffer.from('talaria-solana-derivation', 'utf8');
  const info = Buffer.from('ed25519-seed', 'utf8');
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  const seed = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, 32);
  return seed;
}

export async function createWallet(): Promise<CreateWalletResult> {
  const { ethers } = await import('ethers');
  const { Keypair } = await import('@solana/web3.js');

  // Generate one private key
  const wallet = ethers.Wallet.createRandom();
  const privateKey = wallet.privateKey;
  const evmAddress = wallet.address;

  // Derive Solana keypair from the same key
  const solanaSeed = deriveSolanaKeypair(privateKey);
  const solanaKeypair = Keypair.fromSeed(solanaSeed);
  const solanaAddress = solanaKeypair.publicKey.toBase58();

  // Store one key
  savePrivateKey(privateKey);

  // Store addresses in DB
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

// Recover addresses from the stored private key if DB was reset
async function recoverAddresses(): Promise<void> {
  const raw = loadPrivateKey();
  if (!raw) return;

  const { ethers } = await import('ethers');
  const { Keypair } = await import('@solana/web3.js');

  // Handle old JSON format or raw hex
  let evmKey: string;
  try {
    const parsed = JSON.parse(raw);
    evmKey = parsed.evm;
  } catch {
    evmKey = raw;
  }

  const wallet = new ethers.Wallet(evmKey);
  const solanaSeed = deriveSolanaKeypair(evmKey);
  const solanaKeypair = Keypair.fromSeed(solanaSeed);

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  upsert.run('wallet.evm_address', wallet.address);
  upsert.run('wallet.solana_address', solanaKeypair.publicKey.toBase58());

  // If old JSON format, convert to just the raw key
  try {
    JSON.parse(raw);
    savePrivateKey(evmKey);
  } catch {
    // Already raw format
  }
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
  // If key file exists but addresses aren't in DB, re-derive them
  if (walletExists()) {
    const { evmAddress, solanaAddress } = getStoredAddresses();
    if (!evmAddress || !solanaAddress) {
      await recoverAddresses();
    }
  }

  if (!walletExists()) {
    return {
      exists: false,
      evmAddress: '',
      evmAddressFull: '',
      solanaAddress: '',
      solanaAddressFull: '',
      totalUsd: 0,
      evmBalances: [],
      solanaBalances: [],
      linkedAccounts: [],
    };
  }

  const { evmAddress, solanaAddress } = getStoredAddresses();

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
    evmAddressFull: evmAddress,
    solanaAddress: truncateAddress(solanaAddress),
    solanaAddressFull: solanaAddress,
    totalUsd: 0,
    evmBalances,
    solanaBalances,
    linkedAccounts: [],
  };
}
