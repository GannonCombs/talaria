/**
 * Reseller wallet loader.
 *
 * Reads from the project-local wallet file ONLY. Performs the same path
 * safety checks as scripts/create-wallet.ts at every load — belt and
 * suspenders so a future refactor that breaks the path resolution still
 * fails closed.
 *
 * NEVER touches ~/.agentcash/. The path is hard-coded relative to this
 * source file. No env-var override.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchored to THIS source file's location, not cwd.
// __dirname here is mpp-reseller/src/, so go up one level to mpp-reseller/.
const WALLET_PATH = path.resolve(__dirname, '..', 'keys', 'reseller-wallet.json');

interface StoredWallet {
  privateKey: `0x${string}`;
  address: Address;
  createdAt: string;
  chainId: number;
  purpose: string;
}

interface LoadedWallet {
  privateKey: `0x${string}`;
  address: Address;
}

/**
 * Path safety guardrail. Throws if the resolved absolute path:
 *   - does not contain `mpp-reseller` as a path segment
 *   - does not contain `keys` as a path segment
 *   - contains `.agentcash` anywhere (the user's main wallet directory)
 *
 * Used by both loadWallet() at runtime AND the create-wallet script,
 * so the rules are enforced identically at write-time and read-time.
 *
 * Exported for testing — there's no other reason to call it from outside.
 */
export function assertSafeWalletPath(absolute: string, mode: 'read' | 'write' = 'read'): void {
  const action = mode === 'write' ? 'WRITE' : 'READ';
  const segments = absolute.split(path.sep);
  if (!segments.includes('mpp-reseller')) {
    throw new Error(
      `REFUSING TO ${action}: wallet path does not contain "mpp-reseller" segment: ${absolute}`
    );
  }
  if (!segments.includes('keys')) {
    throw new Error(
      `REFUSING TO ${action}: wallet path does not contain "keys" segment: ${absolute}`
    );
  }
  if (absolute.toLowerCase().includes('.agentcash')) {
    throw new Error(
      `REFUSING TO ${action}: wallet path contains ".agentcash" — that directory is off-limits.\n` +
      `  Resolved: ${absolute}`
    );
  }
}

let cached: LoadedWallet | null = null;

export function loadWallet(): LoadedWallet {
  if (cached) return cached;

  assertSafeWalletPath(WALLET_PATH);

  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error(
      `Reseller wallet not found at ${WALLET_PATH}\n` +
      `  Run \`npm run create-wallet\` from the mpp-reseller directory first.`
    );
  }

  let raw: string;
  try {
    raw = fs.readFileSync(WALLET_PATH, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read wallet file: ${(err as Error).message}`);
  }

  let parsed: StoredWallet;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Wallet file is not valid JSON: ${(err as Error).message}`);
  }

  if (!parsed.privateKey || !/^0x[a-fA-F0-9]{64}$/.test(parsed.privateKey)) {
    throw new Error(`Wallet file missing or malformed privateKey field`);
  }

  // Verify the stored address matches the privateKey at every load.
  // Catches file tampering / corruption.
  const derived = privateKeyToAccount(parsed.privateKey).address;
  if (parsed.address && derived !== parsed.address) {
    throw new Error(
      `Wallet integrity check failed: stored address ${parsed.address} ` +
      `does not match derived address ${derived}. File may be corrupted.`
    );
  }

  cached = { privateKey: parsed.privateKey, address: derived };
  return cached;
}

/** Last 4 chars of an address for display. */
export function shortAddress(addr: Address): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
