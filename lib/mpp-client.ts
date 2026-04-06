import { getDb } from './db';
import { logMppTransaction } from './mpp';

// ── Cache ──

interface CacheEntry {
  cache_key: string;
  endpoint: string;
  response: string;
  cost_usd: number;
  created_at: string;
  expires_at: string | null;
}

export function getCached(cacheKey: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT response, expires_at FROM mpp_cache WHERE cache_key = ?`
    )
    .get(cacheKey) as Pick<CacheEntry, 'response' | 'expires_at'> | undefined;

  if (!row) return null;

  // Check expiration
  if (row.expires_at) {
    const expires = new Date(row.expires_at).getTime();
    if (Date.now() > expires) {
      db.prepare('DELETE FROM mpp_cache WHERE cache_key = ?').run(cacheKey);
      return null;
    }
  }

  return row.response;
}

function setCache(
  cacheKey: string,
  endpoint: string,
  response: string,
  costUsd: number,
  expiresAt: string | null
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO mpp_cache (cache_key, endpoint, response, cost_usd, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(cacheKey, endpoint, response, costUsd, expiresAt);
}

// ── MPP Payment Flow ──

interface MppChallenge {
  challengeId: string;
  method: string;
  intent: string;
  amount: string;
  currency: string;
  chainId: number;
  recipient: string;
  realm: string;
}

function parseWwwAuthenticate(header: string): MppChallenge | null {
  // Parse: Payment id="...", realm="...", method="...", intent="...", request="..."
  const getId = (s: string) => s.match(/id="([^"]+)"/)?.[1] ?? '';
  const getMethod = (s: string) => s.match(/method="([^"]+)"/)?.[1] ?? '';
  const getIntent = (s: string) => s.match(/intent="([^"]+)"/)?.[1] ?? '';
  const getRealm = (s: string) => s.match(/realm="([^"]+)"/)?.[1] ?? '';
  const getRequest = (s: string) => s.match(/request="([^"]+)"/)?.[1] ?? '';

  const method = getMethod(header);
  const intent = getIntent(header);

  // SAFETY: refuse session intents
  if (intent === 'session') {
    console.error('MPP: Refusing session intent — streaming payments not supported');
    return null;
  }

  // Decode the request field (base64url JSON)
  const requestB64 = getRequest(header);
  if (!requestB64) return null;

  try {
    const decoded = JSON.parse(Buffer.from(requestB64, 'base64url').toString());
    return {
      challengeId: getId(header),
      method,
      intent,
      amount: decoded.amount,
      currency: decoded.currency,
      chainId: decoded.methodDetails?.chainId ?? 0,
      recipient: decoded.recipient,
      realm: getRealm(header),
    };
  } catch {
    return null;
  }
}

// Sign and send a USDC.e transfer on Tempo to pay the MPP challenge
async function payChallenge(challenge: MppChallenge): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const { ethers } = await import('ethers');

  // Read our private key
  const pkFile = path.join(process.cwd(), 'keys', 'wallet.key');
  let raw: string;
  try {
    raw = fs.readFileSync(pkFile, 'utf8').trim();
  } catch {
    throw new Error('No wallet key found');
  }

  // Handle old JSON format
  let evmKey: string;
  try {
    evmKey = JSON.parse(raw).evm;
  } catch {
    evmKey = raw;
  }

  // Connect to Tempo RPC
  const provider = new ethers.JsonRpcProvider('https://rpc.tempo.xyz', {
    name: 'tempo',
    chainId: 4217,
  });
  const wallet = new ethers.Wallet(evmKey, provider);

  // ERC-20 transfer to the recipient
  const erc20Abi = ['function transfer(address to, uint256 amount) returns (bool)'];
  const token = new ethers.Contract(challenge.currency, erc20Abi, wallet);

  const tx = await token.transfer(challenge.recipient, BigInt(challenge.amount));
  const receipt = await tx.wait();

  return receipt.hash;
}

// ── Public API ──

export interface CachedMppCallOptions {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  cacheKey: string;
  service: string;
  module: string;
  endpoint: string;
  expiresInDays?: number | null; // null = never expires
}

export async function cachedMppCall(opts: CachedMppCallOptions): Promise<unknown> {
  // 1. Check cache
  const cached = getCached(opts.cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Make the initial request — expect 402
  const initialRes = await fetch(opts.url, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  // If not 402, return the response directly (might be an error or free endpoint)
  if (initialRes.status !== 402) {
    const data = await initialRes.json();
    return data;
  }

  // 3. Parse the 402 challenge
  const wwwAuth = initialRes.headers.get('www-authenticate') ?? '';
  const challenge = parseWwwAuthenticate(wwwAuth);

  if (!challenge) {
    // Try parsing from body (some merchants put it there)
    const body = await initialRes.json();
    throw new Error(`MPP: Could not parse challenge from ${opts.url}: ${JSON.stringify(body).substring(0, 200)}`);
  }

  // 4. Calculate cost for logging
  const costUsd = Number(challenge.amount) / 1e6; // USDC has 6 decimals

  // 5. Pay the challenge
  const txHash = await payChallenge(challenge);

  // 6. Retry the request with the payment credential
  const retryRes = await fetch(opts.url, {
    method: opts.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Payment ${txHash}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  if (!retryRes.ok) {
    throw new Error(`MPP: Retry failed with ${retryRes.status} after payment`);
  }

  const data = await retryRes.json();
  const responseStr = JSON.stringify(data);

  // 7. Cache the response
  const expiresAt = opts.expiresInDays !== undefined && opts.expiresInDays !== null
    ? new Date(Date.now() + opts.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  setCache(opts.cacheKey, opts.endpoint, responseStr, costUsd, expiresAt);

  // 8. Log the transaction
  logMppTransaction({
    service: opts.service,
    module: opts.module,
    endpoint: opts.endpoint,
    rail: 'tempo',
    costUsd,
    metadata: { via: 'usdc', txHash, cacheKey: opts.cacheKey },
  });

  return data;
}

// Get the cost of an MPP call without paying (reads the 402 challenge)
export async function previewMppCost(url: string, body?: Record<string, unknown>): Promise<{
  costUsd: number;
  intent: string;
  method: string;
} | null> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });

    if (res.status !== 402) return null;

    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    const challenge = parseWwwAuthenticate(wwwAuth);
    if (!challenge) return null;

    return {
      costUsd: Number(challenge.amount) / 1e6,
      intent: challenge.intent,
      method: challenge.method,
    };
  } catch {
    return null;
  }
}
