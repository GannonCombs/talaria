# Secure Key Storage — Product Requirements Document

## Overview

Talaria's wallet private keys were previously stored in plaintext JSON files on disk (`~/.agentcash/wallet.json`). Any process running as the user — including AI assistants, scripts, and malware — can read these files and drain the wallet. This PRD moves all private keys into the OS-native credential store (macOS Keychain, Windows Credential Manager, Linux libsecret) via the `keytar` npm package, ensuring keys are never written to any file on the filesystem.

**Depends on:** Talaria Shell (already built)

**Reference implementation:** `visa-mcp/src/security/keychain.ts`

---

## Current State (Insecure)

| Location | Format | Risk |
|----------|--------|------|
| `~/.agentcash/wallet.json` | JSON with `privateKey`, `address`, `createdAt` | Any user-level process can `fs.readFileSync()` the key |
| `mpp-reseller/keys/reseller-wallet.json` | JSON with `privateKey`, `address` | Restricted to mpp-reseller scope, but same vulnerability |

**How keys are used today:**
- `lib/mpp-client.ts` reads `~/.agentcash/wallet.json` via `fs.readFileSync`, extracts `privateKey`, passes to `privateKeyToAccount()` (viem), then to `Mppx.create({ methods: [tempo({ account })] })`
- `lib/wallet.ts` reads the same file to get the EVM address for balance queries
- The Solana address is fetched from the AgentCash CLI and cached in `user_preferences`

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        OS Keychain                               │
│                                                                  │
│  Service: 'talaria'  Account: 'evm-key'     → EVM private key   │
│  Service: 'talaria'  Account: 'solana-key'  → Solana private key │
│                                                                  │
│  (macOS: Keychain Access / security CLI)                         │
│  (Windows: Credential Manager via keytar)                        │
│  (Linux: libsecret via keytar)                                   │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  lib/mpp-client.ts              lib/wallet.ts
  reads EVM key once             derives EVM address from key
  builds Mppx client             derives Solana address from key
  caches singleton               queries on-chain balances
```

**Invariants:**
1. No private key is ever written to any file on the filesystem
2. Addresses are derived from private keys at runtime — never stored separately
3. The keychain is read once per server lifetime; the result is cached in memory
4. Claude Code (and any other process) cannot read the keychain without OS-level permission prompts

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `keytar` | `^7.9.0` | Cross-platform credential storage (N-API native addon) |
| `viem` | (already installed) | `privateKeyToAccount()` for EVM address derivation |
| `@solana/web3.js` | (already installed) | `Keypair.fromSecretKey()` for Solana address derivation |

`keytar` delegates to:
- **macOS:** Keychain Services (via Security.framework)
- **Windows:** Windows Credential Manager (via wincred)
- **Linux:** libsecret (via D-Bus Secret Service)

---

## KeychainManager API

**File:** `lib/security/keychain.ts`

```typescript
import * as keytar from 'keytar';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SERVICE_NAME = 'talaria';

const ACCOUNTS = {
  EVM_KEY: 'evm-key',
  SOLANA_KEY: 'solana-key',
} as const;

export class KeychainManager {
  // ── EVM private key ──
  // Stored under service 'talaria', account 'evm-key'.
  // On macOS, uses the `security` CLI for keychain operations.
  // On other platforms, uses keytar directly.

  static async saveEvmKey(privateKey: string): Promise<void>
  static async getEvmKey(): Promise<string | null>
  static async deleteEvmKey(): Promise<boolean | void>
  static async hasEvmKey(): Promise<boolean>

  // ── Solana private key ──
  // Stored under service 'talaria', account 'solana-key'.

  static async saveSolanaKey(key: string): Promise<void>
  static async getSolanaKey(): Promise<string | null>
  static async deleteSolanaKey(): Promise<boolean>
  static async hasSolanaKey(): Promise<boolean>

  // ── Diagnostics ──

  static async listCredentials(): Promise<{ account: string; hasValue: boolean }[]>
  static async clearAll(): Promise<void>
}
```

### Platform-Specific EVM Key Storage

On **macOS**, the EVM key uses the native `security` CLI rather than keytar:

```typescript
// Save
await execFileAsync('security', [
  'add-generic-password', '-s', 'talaria', '-a', 'evm-key', '-w', privateKey, '-U',
]);

// Read
const { stdout } = await execFileAsync('security', [
  'find-generic-password', '-s', 'talaria', '-a', 'evm-key', '-w',
]);
return stdout.trim() || null;

// Delete
await execFileAsync('security', [
  'delete-generic-password', '-s', 'talaria', '-a', 'evm-key',
]);
```

On **Windows** and **Linux**, the EVM key uses keytar with service `'talaria'`, account `'evm-key'`:

```typescript
await keytar.setPassword('talaria', 'evm-key', privateKey);
await keytar.getPassword('talaria', 'evm-key');
await keytar.deletePassword('talaria', 'evm-key');
```

The Solana key uses the same pattern: service `'talaria'`, account `'solana-key'` — same service, same keytar/`security` CLI approach, all platforms.

---

## Address Derivation

Addresses are never stored — they are derived from the private key each time. The derivation is fast (< 1ms) and deterministic.

**File:** `lib/security/keychain.ts` (helper exports)

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function deriveEvmAddress(privateKey: `0x${string}`): string {
  return privateKeyToAccount(privateKey).address;
}

export function deriveSolanaAddress(secretKeyBase58: string): string {
  const keypair = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  return keypair.publicKey.toBase58();
}
```

---

## Next.js Integration

`keytar` is a native Node.js addon (N-API). Next.js must be told to keep it server-side and not attempt to bundle it.

**File:** `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'agentcash', 'mppx', 'viem', 'keytar'],
  // ...
};
```

`keytar` must never be imported from client components. All keychain reads happen in API routes or server components. The existing pattern (used by `better-sqlite3`) is the same.

---

## Changes to `lib/mpp-client.ts`

The current `loadWallet()` function (lines 92-99) reads the private key from a JSON file:

```typescript
// BEFORE (insecure)
function loadWallet(): AgentCashWallet {
  const raw = fs.readFileSync(AGENTCASH_WALLET_PATH, 'utf8');
  return JSON.parse(raw);
}
```

Replace with an async keychain read:

```typescript
// AFTER (secure)
async function loadWallet(): Promise<{ privateKey: `0x${string}`; address: string }> {
  const privateKey = await KeychainManager.getEvmKey();
  if (!privateKey) {
    throw new Error(
      'No EVM key found in keychain. Run: npx tsx scripts/migrate-wallet.ts'
    );
  }
  const hex = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as `0x${string}`;
  return { privateKey: hex, address: deriveEvmAddress(hex) };
}
```

The `buildClient()` and `getMppxClient()` functions become async. The singleton caches after the first successful read, so the keychain is accessed exactly once per server lifetime:

```typescript
let _clientPromise: Promise<ReturnType<typeof buildClient>> | null = null;

async function buildClient() {
  const wallet = await loadWallet();
  const account = privateKeyToAccount(wallet.privateKey);
  return Mppx.create({ polyfill: false, methods: [tempo({ account })] });
}

function getMppxClient() {
  if (!_clientPromise) _clientPromise = buildClient();
  return _clientPromise;
}

export async function paidFetch(url: string, init?: RequestInit): Promise<Response> {
  const client = await getMppxClient();
  return client.fetch(url, init);
}
```

---

## Changes to `lib/wallet.ts`

The current `loadAgentCashWallet()` reads the private key from disk just to get the address. Replace with keychain-derived addresses:

```typescript
// BEFORE
function loadAgentCashWallet(): AgentCashWallet | null {
  const raw = fs.readFileSync(AGENTCASH_WALLET_PATH, 'utf8');
  return JSON.parse(raw);
}

// AFTER
async function getWalletAddresses(): Promise<{ evm: string; solana: string }> {
  const evmKey = await KeychainManager.getEvmKey();
  const solKey = await KeychainManager.getSolanaKey();
  return {
    evm: evmKey ? deriveEvmAddress(evmKey as `0x${string}`) : '',
    solana: solKey ? deriveSolanaAddress(solKey) : '',
  };
}
```

The `getWalletBalance()` function becomes fully async (it already is) and uses `getWalletAddresses()` instead of reading files.

---

## Migration Script

**File:** `scripts/migrate-wallet.ts`

A one-time script that:
1. Generates new wallets and stores them in the OS keychain
2. Transfers USDC.e from the old (compromised) wallet to the new one
3. Is idempotent — safe to run multiple times

### Flow

```
1. Check KeychainManager.hasEvmKey()
   ├── YES → Print existing address, skip generation
   └── NO  → Generate new EVM key, save to keychain

2. Check KeychainManager.hasSolanaKey()
   ├── YES → Print existing address, skip generation
   └── NO  → Generate new Solana keypair, save to keychain

3. Check for old wallet at ~/.agentcash/wallet.json
   ├── NOT FOUND → Print "No old wallet to migrate", done
   └── FOUND → Read old key, query USDC.e balance on Tempo chain
       ├── Balance = 0 → Print "Nothing to transfer", done
       └── Balance > 0 → Transfer USDC.e from old address to new address
           - Build ethers.js Wallet from old key
           - Call USDC.e token.transfer(newAddress, balance)
           - Wait for on-chain confirmation
           - Print tx hash

4. Print summary:
   - New EVM address: 0x...
   - New Solana address: ...
   - Transfer tx: 0x... (if applicable)
   - "Now manually delete:"
   -   rm ~/.agentcash/wallet.json
```

### Idempotency

The script checks `hasEvmKey()` / `hasSolanaKey()` before generating. If keys already exist in the keychain, it prints the derived addresses and skips to the transfer step. This means:
- Running the script twice does not create a second wallet
- Running the script after a successful migration just prints the current state
- The transfer step also checks balance, so it's safe to re-run after funds have moved

### Constants

```typescript
const TEMPO_RPC = 'https://rpc.tempo.xyz';
const TEMPO_CHAIN_ID = 4217;
const USDC_E_TOKEN = '0x20C000000000000000000000b9537d11c60E8b50';
const AGENTCASH_WALLET_PATH = path.join(os.homedir(), '.agentcash', 'wallet.json');
```

### Windows Machine

The migration must be run independently on each machine. Private keys in OS keychains are per-machine — they don't sync across devices. The Windows machine needs:
1. `keytar` installed (it uses Windows Credential Manager under the hood)
2. The migration script run locally
3. If there's a separate wallet with funds on Windows, those funds need to be transferred to the new Windows wallet's address

---

## API Route Changes

**File:** `app/api/wallet/route.ts`

The POST handler (wallet creation) currently delegates to AgentCash CLI. Replace with keychain-based generation:

```typescript
export async function POST() {
  const hasEvm = await KeychainManager.hasEvmKey();
  const hasSolana = await KeychainManager.hasSolanaKey();

  if (hasEvm && hasSolana) {
    // Already initialized — return existing addresses
    const { evm, solana } = await getWalletAddresses();
    return Response.json({ evmAddress: evm, solanaAddress: solana });
  }

  // Generate missing keys
  if (!hasEvm) {
    const key = generatePrivateKey(); // viem
    await KeychainManager.saveEvmKey(key);
  }
  if (!hasSolana) {
    const keypair = Keypair.generate(); // @solana/web3.js
    await KeychainManager.saveSolanaKey(bs58.encode(keypair.secretKey));
  }

  const { evm, solana } = await getWalletAddresses();
  return Response.json({ evmAddress: evm, solanaAddress: solana });
}
```

The GET handler (balance query) uses `getWalletAddresses()` instead of reading from the filesystem.

---

## Build Order

### Phase 1: Infrastructure
1. Add `keytar@^7.9.0` to `package.json`
2. Add `'keytar'` to `serverExternalPackages` in `next.config.ts`
3. Create `lib/security/keychain.ts` with `KeychainManager` class and address derivation helpers

### Phase 2: Migration Script
4. Create `scripts/migrate-wallet.ts`
5. Test: run on macOS, verify key appears in Keychain Access (under service `talaria`)
6. Test: verify USDC.e transfer from old wallet to new wallet on Tempo chain

### Phase 3: Wire Up Application
7. Update `lib/mpp-client.ts` — replace `loadWallet()` with async keychain read
8. Update `lib/wallet.ts` — replace `loadAgentCashWallet()` with keychain-derived addresses
9. Update `app/api/wallet/route.ts` — use keychain for creation and balance queries
10. Test: `npm run dev`, verify wallet balance displays correctly, verify `paidFetch()` works (make a housing data call)

### Phase 4: Cleanup
11. User manually deletes `~/.agentcash/wallet.json` and `keys/wallet.key`
12. Remove dead code: `AGENTCASH_WALLET_PATH`, `loadAgentCashWallet()`, `getAgentCashSolanaAddress()` CLI call
13. Remove `agentcash` from `devDependencies` and `serverExternalPackages` (if no longer needed)

---

## Security Guarantees

| Threat | Mitigation |
|--------|------------|
| AI assistant reads private key from file | Key is in OS keychain, not filesystem — `fs.readFileSync` cannot access it |
| Malware scans home directory for wallet files | No wallet files exist on disk after migration |
| Process reads key from environment variable | Key is never in env vars — read from keychain at runtime |
| Key extracted from process memory | Same risk as any in-memory secret; mitigated by short-lived access (read once, cache the Mppx client, not the raw key) |
| Keychain access without user consent | macOS: Keychain prompts on first access by a new binary. Windows: Credential Manager scoped to user session |

---

## Rollback Plan

If `keytar` causes issues (native build failures, Next.js bundling problems):

**Fallback A (macOS only):** Drop `keytar` entirely. Use the macOS `security` CLI for all credential operations (via `execFile`). This requires no native Node.js addon.

**Fallback B (cross-platform):** Use encrypted file storage with a master password derived from the OS keychain. Store an encrypted blob at `~/.talaria/wallet.enc`, with the decryption key stored in the OS keychain via `security` CLI (macOS) or `cmdkey` (Windows).
