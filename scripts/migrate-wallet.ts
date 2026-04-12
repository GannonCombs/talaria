/**
 * Transfer USDC.e from the old (compromised) wallet to the new keychain wallet.
 *
 * Prerequisites: Create a new wallet first by clicking "Add Wallet" on the
 * /wallet page. This script does NOT generate keys — it only transfers funds.
 *
 * Idempotent — safe to run multiple times. If the old wallet has no balance,
 * it reports that and exits.
 *
 * Usage:
 *   npx tsx scripts/migrate-wallet.ts                # transfer entire balance
 *   npx tsx scripts/migrate-wallet.ts --amount 0.02  # transfer $0.02 (test run)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { ethers } from 'ethers';
import { KeychainManager, deriveEvmAddress, deriveSolanaAddress } from '../lib/security/keychain';

const TEMPO_RPC = 'https://rpc.tempo.xyz';
const TEMPO_CHAIN_ID = 4217;
const USDC_CONTRACT = '0x20C000000000000000000000b9537d11c60E8b50';
const AGENTCASH_WALLET_PATH = path.join(os.homedir(), '.agentcash', 'wallet.json');

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

async function main() {
  console.log('='.repeat(60));
  console.log('Talaria Wallet Migration — Fund Transfer');
  console.log('='.repeat(60));
  console.log();

  // ── Step 1: Verify new wallet exists in keychain ─────────────────

  const evmKey = await KeychainManager.getEvmKey();
  if (!evmKey) {
    console.error('ERROR: No EVM key found in OS keychain.');
    console.error('Create a wallet first by clicking "Add Wallet" on the /wallet page.');
    process.exit(1);
  }

  const newEvmAddress = deriveEvmAddress(evmKey);
  console.log(`[New wallet] EVM address: ${newEvmAddress}`);

  const solKey = await KeychainManager.getSolanaKey();
  if (solKey) {
    console.log(`[New wallet] Solana address: ${deriveSolanaAddress(solKey)}`);
  }
  console.log();

  // ── Step 2: Read old wallet ──────────────────────────────────────

  let oldWallet: { privateKey: string; address: string } | null = null;
  try {
    const raw = fs.readFileSync(AGENTCASH_WALLET_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.privateKey) {
      oldWallet = { privateKey: parsed.privateKey, address: parsed.address };
    }
  } catch {
    // File doesn't exist or is invalid
  }

  if (!oldWallet) {
    console.log('[Old wallet] Not found at', AGENTCASH_WALLET_PATH);
    console.log('             Nothing to transfer. You\'re all set!');
    process.exit(0);
  }

  if (oldWallet.address.toLowerCase() === newEvmAddress.toLowerCase()) {
    console.log('[Old wallet] Same as new wallet — no transfer needed.');
    process.exit(0);
  }

  console.log(`[Old wallet] Address: ${oldWallet.address}`);

  // ── Step 3: Transfer USDC.e ──────────────────────────────────────

  const provider = new ethers.JsonRpcProvider(TEMPO_RPC, {
    name: 'tempo',
    chainId: TEMPO_CHAIN_ID,
  });
  const signer = new ethers.Wallet(oldWallet.privateKey, provider);
  const token = new ethers.Contract(USDC_CONTRACT, ERC20_ABI, signer);

  const balance: bigint = await token.balanceOf(oldWallet.address);
  const decimals = Number(await token.decimals());
  const formatted = ethers.formatUnits(balance, decimals);

  if (balance === 0n) {
    console.log(`[Transfer]   Balance: $${formatted} USDC.e — nothing to transfer.`);
    process.exit(0);
  }

  // Parse --amount flag for partial transfers (e.g., test runs)
  const amountFlag = process.argv.indexOf('--amount');
  let transferAmount = balance;
  let transferFormatted = formatted;

  if (amountFlag !== -1 && process.argv[amountFlag + 1]) {
    const usd = parseFloat(process.argv[amountFlag + 1]);
    if (isNaN(usd) || usd <= 0) {
      console.error('ERROR: --amount must be a positive number (e.g., --amount 0.02)');
      process.exit(1);
    }
    transferAmount = BigInt(Math.round(usd * (10 ** decimals)));
    if (transferAmount > balance) {
      console.error(`ERROR: Requested $${usd} but only $${formatted} available.`);
      process.exit(1);
    }
    transferFormatted = ethers.formatUnits(transferAmount, decimals);
  }

  console.log(`[Transfer]   Balance: $${formatted} USDC.e`);
  console.log(`[Transfer]   Sending $${transferFormatted} to ${newEvmAddress}...`);

  const tx = await token.transfer(newEvmAddress, transferAmount);
  console.log(`[Transfer]   Tx hash: ${tx.hash}`);
  console.log('[Transfer]   Waiting for confirmation...');

  const receipt = await tx.wait();
  console.log(`[Transfer]   Confirmed in block ${receipt.blockNumber}`);
  console.log(`[Transfer]   https://explore.tempo.xyz/tx/${tx.hash}`);

  // ── Summary ──────────────────────────────────────────────────────

  console.log();
  console.log('='.repeat(60));
  console.log('Transfer complete!');
  console.log();
  console.log('Now manually delete the old plaintext key files:');
  console.log();
  console.log(`  rm ${AGENTCASH_WALLET_PATH}`);
  console.log();
  console.log('If you have a Windows machine, create a wallet there too');
  console.log('(via /wallet) and run this script to transfer any funds.');
  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
