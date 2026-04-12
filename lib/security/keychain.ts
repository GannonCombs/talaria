// OS-native credential storage for wallet private keys.
// Keys are stored in the OS keychain (macOS Keychain / Windows Credential
// Manager / Linux libsecret) — never on the filesystem.
//
// On macOS, uses the `security` CLI for keychain operations (avoids
// permission popups from keytar's direct Keychain Services access).
// On other platforms, uses keytar directly.
//
// Server-only — never import from client components.

import * as keytar from 'keytar';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';

const execFileAsync = promisify(execFile);

const SERVICE_NAME = 'talaria';

const ACCOUNTS = {
  EVM_KEY: 'evm-key',
  SOLANA_KEY: 'solana-key',
} as const;

const isMac = os.platform() === 'darwin';

// ── macOS `security` CLI helpers ────────────────────────────────────────

async function macSave(service: string, account: string, value: string): Promise<void> {
  await execFileAsync('security', [
    'add-generic-password', '-s', service, '-a', account, '-w', value, '-U',
  ]);
}

async function macGet(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('security', [
      'find-generic-password', '-s', service, '-a', account, '-w',
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function macDelete(service: string, account: string): Promise<void> {
  try {
    await execFileAsync('security', [
      'delete-generic-password', '-s', service, '-a', account,
    ]);
  } catch {
    // Ignore if not found
  }
}

// ── Cross-platform save/get/delete ──────────────────────────────────────

async function saveCredential(account: string, value: string): Promise<void> {
  if (isMac) {
    await macSave(SERVICE_NAME, account, value);
  } else {
    await keytar.setPassword(SERVICE_NAME, account, value);
  }
}

async function getCredential(account: string): Promise<string | null> {
  if (isMac) {
    return macGet(SERVICE_NAME, account);
  }
  return keytar.getPassword(SERVICE_NAME, account);
}

async function deleteCredential(account: string): Promise<void> {
  if (isMac) {
    await macDelete(SERVICE_NAME, account);
  } else {
    await keytar.deletePassword(SERVICE_NAME, account);
  }
}

// ── Address derivation helpers ──────────────────────────────────────────

export function deriveEvmAddress(privateKey: string): string {
  const hex = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  return privateKeyToAccount(hex).address;
}

export function deriveSolanaAddress(secretKeyBase64: string): string {
  const bytes = Buffer.from(secretKeyBase64, 'base64');
  const keypair = Keypair.fromSecretKey(bytes);
  return keypair.publicKey.toBase58();
}

// ── KeychainManager ─────────────────────────────────────────────────────

export class KeychainManager {
  // ── EVM private key ──

  static async saveEvmKey(privateKey: string): Promise<void> {
    await saveCredential(ACCOUNTS.EVM_KEY, privateKey);
  }

  static async getEvmKey(): Promise<string | null> {
    return getCredential(ACCOUNTS.EVM_KEY);
  }

  static async deleteEvmKey(): Promise<void> {
    await deleteCredential(ACCOUNTS.EVM_KEY);
  }

  static async hasEvmKey(): Promise<boolean> {
    return (await this.getEvmKey()) !== null;
  }

  // ── Solana private key ──

  static async saveSolanaKey(key: string): Promise<void> {
    await saveCredential(ACCOUNTS.SOLANA_KEY, key);
  }

  static async getSolanaKey(): Promise<string | null> {
    return getCredential(ACCOUNTS.SOLANA_KEY);
  }

  static async deleteSolanaKey(): Promise<void> {
    await deleteCredential(ACCOUNTS.SOLANA_KEY);
  }

  static async hasSolanaKey(): Promise<boolean> {
    return (await this.getSolanaKey()) !== null;
  }

  // ── Convenience: get addresses (derived from keys) ──

  static async getEvmAddress(): Promise<string | null> {
    const key = await this.getEvmKey();
    return key ? deriveEvmAddress(key) : null;
  }

  static async getSolanaAddress(): Promise<string | null> {
    const key = await this.getSolanaKey();
    return key ? deriveSolanaAddress(key) : null;
  }

  // ── Diagnostics ──

  static async listCredentials(): Promise<{ account: string; hasValue: boolean }[]> {
    const result: { account: string; hasValue: boolean }[] = [];
    for (const [, account] of Object.entries(ACCOUNTS)) {
      const value = await getCredential(account);
      result.push({ account, hasValue: value !== null });
    }
    return result;
  }

  static async clearAll(): Promise<void> {
    for (const [, account] of Object.entries(ACCOUNTS)) {
      try {
        await deleteCredential(account);
      } catch {
        // Ignore errors for non-existent credentials
      }
    }
  }
}
