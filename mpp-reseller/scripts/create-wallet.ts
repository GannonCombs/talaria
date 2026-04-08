/**
 * Generate a brand-new EVM wallet for the MPP reseller.
 *
 * Safety constraints (every one is non-negotiable):
 *   1. Path is HARD-CODED relative to the script file. No env-var override.
 *      No CLI flag. The only way to point this at a different file is to
 *      edit this source — which is the friction we want.
 *   2. Resolved path MUST contain `mpp-reseller` and `keys` segments.
 *   3. Resolved path MUST NOT contain `.agentcash` anywhere. Throws on
 *      violation, never proceeds.
 *   4. Refuses to overwrite an existing wallet file. The user must manually
 *      delete it to regenerate. No --force flag.
 *   5. Round-trip verifies the generated wallet (re-reads the file, derives
 *      the address from the stored privateKey, asserts they match) before
 *      considering creation successful.
 *   6. Never prints the private key to stdout. Address is fine to print.
 *   7. Generates a fresh MPP_SECRET_KEY alongside the wallet for the user
 *      to paste into .env.
 *
 * Usage:
 *   cd mpp-reseller
 *   npm run create-wallet
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { assertSafeWalletPath } from '../src/wallet.js';

const TEMPO_USDC_E = '0x20C000000000000000000000b9537d11c60E8b50';
const TEMPO_CHAIN_ID = 4217;

// ── Hard-coded path resolution ──────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve relative to THIS script file, NOT cwd. Even if someone runs
// `cd ~/.agentcash && tsx /path/to/create-wallet.ts`, the path is anchored
// to the source file location.
const WALLET_PATH = path.resolve(__dirname, '..', 'keys', 'reseller-wallet.json');

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('mpp-reseller — wallet creation');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(`Target path: ${WALLET_PATH}`);

  // Step 1: safety check the resolved path
  assertSafeWalletPath(WALLET_PATH, 'write');
  console.log('✓ Path safety checks passed');

  // Step 2: refuse if already exists
  if (fs.existsSync(WALLET_PATH)) {
    console.error('');
    console.error('✗ REFUSING TO OVERWRITE: a wallet file already exists at this path.');
    console.error('');
    console.error('  If you genuinely want to regenerate (and you have backed up the');
    console.error('  existing wallet first!), manually delete the file and re-run:');
    console.error('');
    console.error(`    rm "${WALLET_PATH}"`);
    console.error('    npm run create-wallet');
    console.error('');
    process.exit(1);
  }

  // Step 3: ensure parent directory exists (mpp-reseller/keys/)
  const keysDir = path.dirname(WALLET_PATH);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
    console.log(`✓ Created keys directory: ${keysDir}`);
  }

  // Step 4: generate wallet
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const createdAt = new Date().toISOString();

  const walletData = {
    privateKey,
    address: account.address,
    createdAt,
    chainId: TEMPO_CHAIN_ID,
    purpose: 'mpp-reseller-round2',
    note: 'NEVER share this private key. Back it up before funding.',
  };

  // Step 5: write the file with restrictive permissions where possible
  fs.writeFileSync(WALLET_PATH, JSON.stringify(walletData, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  console.log('✓ Wallet file written');

  // Step 6: round-trip verification
  let stored: typeof walletData;
  try {
    stored = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf8'));
  } catch (err) {
    fs.unlinkSync(WALLET_PATH);
    throw new Error(`ROUND-TRIP FAIL: could not re-read wallet file: ${(err as Error).message}`);
  }
  const derivedAddress = privateKeyToAccount(stored.privateKey as `0x${string}`).address;
  if (derivedAddress !== stored.address) {
    fs.unlinkSync(WALLET_PATH);
    throw new Error(
      `ROUND-TRIP FAIL: re-derived address ${derivedAddress} does not match stored ${stored.address}.\n` +
      `Wallet file has been deleted. Investigate filesystem corruption.`
    );
  }
  if (stored.privateKey !== privateKey) {
    fs.unlinkSync(WALLET_PATH);
    throw new Error('ROUND-TRIP FAIL: stored privateKey does not match generated value.');
  }
  console.log('✓ Round-trip verification passed');

  // Step 7: generate a random MPP_SECRET_KEY for the user to paste into .env
  const mppSecretKey = crypto.randomBytes(32).toString('hex');

  // ── Final output to user ──────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' WALLET CREATED — back this up before funding');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Address:        ${account.address}`);
  console.log(`  File:           ${WALLET_PATH}`);
  console.log(`  Chain:          Tempo mainnet (${TEMPO_CHAIN_ID})`);
  console.log(`  Token contract: ${TEMPO_USDC_E}  (USDC.e)`);
  console.log('');
  console.log('  The PRIVATE KEY is stored in the file above. Open the file');
  console.log('  yourself, copy the privateKey field, and back it up to your');
  console.log('  password manager / encrypted vault. This script will NOT');
  console.log('  print the private key to your terminal scrollback.');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(' MPP_SECRET_KEY for .env');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  console.log('  Add this line to mpp-reseller/.env:');
  console.log('');
  console.log(`    MPP_SECRET_KEY=${mppSecretKey}`);
  console.log('');
  console.log('  This is the per-server secret mppx uses to bind 402 challenge');
  console.log('  IDs to their content. It does not need to be secret from you,');
  console.log('  but it should be unique per reseller instance.');
  console.log('');
  console.log('───────────────────────────────────────────────────────────────');
  console.log(' Funding the wallet');
  console.log('───────────────────────────────────────────────────────────────');
  console.log('');
  console.log('  The reseller wallet starts at 0 USDC.e. It earns USDC.e from');
  console.log('  every paid call you make to it. You do NOT need to fund it');
  console.log('  for testing — the Round 1 harness will pay it during sweeps.');
  console.log('');
  console.log('  If you want to fund it manually anyway, send Tempo USDC.e');
  console.log('  to the address above. The token contract is shown above.');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('create-wallet FAILED:');
  console.error((err as Error).message);
  console.error('');
  process.exit(1);
});
