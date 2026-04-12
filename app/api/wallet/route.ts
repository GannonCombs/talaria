import { NextResponse } from 'next/server';
import { getWalletBalance, walletExists } from '@/lib/wallet';
import { KeychainManager } from '@/lib/security/keychain';
import { generatePrivateKey } from 'viem/accounts';
import { Keypair } from '@solana/web3.js';

export async function GET() {
  const wallet = await getWalletBalance();
  return NextResponse.json(wallet);
}

export async function POST() {
  if (await walletExists()) {
    const wallet = await getWalletBalance();
    return NextResponse.json({ ok: true, evmAddress: wallet.evmAddressFull });
  }

  // Generate new keys and store in OS keychain (never touches filesystem)
  const evmKey = generatePrivateKey();
  await KeychainManager.saveEvmKey(evmKey);

  const solKeypair = Keypair.generate();
  await KeychainManager.saveSolanaKey(
    Buffer.from(solKeypair.secretKey).toString('base64')
  );

  const wallet = await getWalletBalance();
  return NextResponse.json({ ok: true, evmAddress: wallet.evmAddressFull });
}
