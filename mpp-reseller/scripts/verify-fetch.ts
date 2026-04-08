/**
 * Verification + reference: pay an MPP endpoint manually and save the raw
 * response body to a file.
 *
 * This script does the full 402 dance directly using mppx primitives
 * (Challenge.fromResponse + Credential.from + Credential.serialize) and
 * viem for the on-chain transfer. It does NOT shell out to the agentcash
 * CLI subprocess.
 *
 * Two reasons it exists:
 *
 *   1. Verification — the agentcash CLI's --format json discards binary
 *      response bodies (returns {"data":{"type":"image"}}). To prove the
 *      reseller is returning real Streetview JPEGs and not Google's "no
 *      imagery" placeholder, we need a path that actually keeps the bytes.
 *
 *   2. Reference for future Round 3 — this is a working ~150-line example
 *      of how Talaria's housing module could call MPP endpoints directly,
 *      without spawning the agentcash CLI subprocess on every call. In
 *      Round 2 testing, this direct path completed a full streetview
 *      payment + retrieval in ~2.3 seconds end-to-end, vs ~4 seconds when
 *      going through the agentcash CLI shellout. Worth ~2× speedup if
 *      Talaria ever wants to inline its MPP integration.
 *
 * Reads (read-only) the user's main agentcash wallet at the standard
 * location. Per the standing memory rule: never WRITE to that directory;
 * reading is OK and is what the agentcash CLI itself does.
 *
 * Usage:
 *   npx tsx scripts/verify-fetch.ts <url> <output-path>
 *
 * Examples:
 *   npx tsx scripts/verify-fetch.ts \
 *     "http://127.0.0.1:8787/maps/streetview?location=30.2672,-97.7431&size=600x400" \
 *     /tmp/test-streetview.jpg
 *
 *   npx tsx scripts/verify-fetch.ts \
 *     "http://127.0.0.1:8787/maps/place/textsearch/json?query=restaurants+in+Austin+TX" \
 *     /tmp/test-textsearch.json
 *
 * Each call costs $0.001 USDC.e (paid from your main agentcash wallet to
 * the reseller wallet). Reseller must be running on 127.0.0.1:8787.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { Challenge, Credential } from 'mppx';

// ── Tempo chain ─────────────────────────────────────────────────────────────

const tempo = defineChain({
  id: 4217,
  name: 'Tempo',
  nativeCurrency: { name: 'TIP', symbol: 'TIP', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.tempo.xyz'] },
  },
});

const USDC_E_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

// ── Wallet (read-only from ~/.agentcash/wallet.json) ────────────────────────

const AGENTCASH_WALLET_PATH = path.join(os.homedir(), '.agentcash', 'wallet.json');

interface StoredWallet {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

function loadAgentcashWallet(): StoredWallet {
  if (!fs.existsSync(AGENTCASH_WALLET_PATH)) {
    throw new Error(
      `Main agentcash wallet not found at ${AGENTCASH_WALLET_PATH}. ` +
      `Has agentcash been initialized?`
    );
  }
  const raw = fs.readFileSync(AGENTCASH_WALLET_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.privateKey || !/^0x[a-fA-F0-9]{64}$/.test(parsed.privateKey)) {
    throw new Error('Wallet file missing or malformed privateKey');
  }
  return { privateKey: parsed.privateKey, address: parsed.address };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.argv[2];
  const outputPath = process.argv[3];
  if (!url || !outputPath) {
    console.error('Usage: tsx scratch/verify-fetch.ts <url> <output-path>');
    process.exit(2);
  }

  console.log(`URL:    ${url}`);
  console.log(`Output: ${outputPath}`);
  console.log('');

  const wallet = loadAgentcashWallet();
  console.log(`Paying from: ${wallet.address}`);

  const account = privateKeyToAccount(wallet.privateKey);
  const walletClient = createWalletClient({ account, chain: tempo, transport: http() });
  const publicClient = createPublicClient({ chain: tempo, transport: http() });

  // Step 1: GET → expect 402
  console.log('1. Initial GET (expect 402)…');
  const t0 = performance.now();
  const initialRes = await fetch(url, { method: 'GET' });
  console.log(`   status=${initialRes.status} (${Math.round(performance.now() - t0)}ms)`);
  if (initialRes.status !== 402) {
    console.error('Expected 402, got', initialRes.status);
    process.exit(1);
  }

  // Use mppx's own Challenge.fromResponse to parse the 402 challenge into
  // a typed Challenge object. This is what we'll embed in the credential.
  const challenge = Challenge.fromResponse(initialRes);
  if (challenge.intent === 'session') throw new Error('Refusing session intent');
  const req = challenge.request as { amount: string; currency: `0x${string}`; recipient?: `0x${string}` };
  const amount = BigInt(req.amount);
  const currency = req.currency;
  const recipient = req.recipient!;
  console.log(`   intent=${challenge.intent} amount=${amount} (= $${Number(amount) / 1e6})`);
  console.log(`   recipient=${recipient}`);
  await initialRes.arrayBuffer(); // drain

  // Step 2: Sign and broadcast USDC.e transfer
  console.log('2. Broadcasting USDC.e transfer on Tempo…');
  const t1 = performance.now();
  const txHash = await walletClient.writeContract({
    address: currency,
    abi: USDC_E_ABI,
    functionName: 'transfer',
    args: [recipient, amount],
  });
  console.log(`   txHash=${txHash} (${Math.round(performance.now() - t1)}ms)`);

  // Step 3: Wait for inclusion
  console.log('3. Waiting for receipt…');
  const t2 = performance.now();
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`   block=${receipt.blockNumber} status=${receipt.status} (${Math.round(performance.now() - t2)}ms)`);

  // Step 4: Build the credential and retry. The Authorization header is
  // "Payment <base64url(JSON({challenge, payload: {type:'hash', hash}}))>"
  // which mppx Credential.serialize builds for us.
  console.log('4. Retrying with Payment header…');
  const credential = Credential.from({
    challenge,
    payload: { type: 'hash', hash: txHash },
  });
  const authHeader = Credential.serialize(credential);
  const t3 = performance.now();
  const retryRes = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader },
  });
  console.log(`   status=${retryRes.status} content-type=${retryRes.headers.get('content-type')} (${Math.round(performance.now() - t3)}ms)`);
  if (!retryRes.ok) {
    const text = await retryRes.text();
    console.error('Retry failed:', text);
    process.exit(1);
  }

  // Step 5: Save the bytes to disk
  console.log('5. Saving response body…');
  const buf = Buffer.from(await retryRes.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
  console.log(`   wrote ${buf.byteLength} bytes to ${outputPath}`);

  // Step 6: Sniff the file to confirm what it is
  const magic = buf.subarray(0, 4);
  const hex = magic.toString('hex');
  let kind = 'unknown';
  if (hex.startsWith('ffd8ff')) kind = 'JPEG image';
  else if (hex.startsWith('89504e47')) kind = 'PNG image';
  else if (hex.startsWith('7b')) kind = 'JSON (starts with {)';
  else if (hex.startsWith('5b')) kind = 'JSON (starts with [)';
  console.log(`   magic bytes: ${hex} → ${kind}`);

  console.log('');
  console.log(`✓ Verification complete: ${outputPath} (${buf.byteLength} bytes, ${kind})`);
}

main().catch((err) => {
  console.error('verify-fetch FAILED:', err);
  process.exit(1);
});
