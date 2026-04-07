import { NextResponse } from 'next/server';
import { getWalletBalance, walletExists } from '@/lib/wallet';
import { getDb } from '@/lib/db';
import { execSync } from 'child_process';

export async function GET() {
  const wallet = await getWalletBalance();
  return NextResponse.json(wallet);
}

export async function POST() {
  if (walletExists()) {
    const wallet = await getWalletBalance();
    return NextResponse.json({ ok: true, evmAddress: wallet.evmAddressFull });
  }

  try {
    const output = execSync('npx agentcash@latest onboard --yes', {
      timeout: 30000,
      stdio: 'pipe',
    }).toString();

    // Cache the Solana address from the onboard output
    try {
      const data = JSON.parse(output);
      const solAccount = data.data?.wallet?.accounts?.find(
        (a: { network: string }) => a.network === 'solana'
      );
      if (solAccount?.address) {
        const db = getDb();
        db.prepare(
          `INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES (?, ?, datetime('now'))`
        ).run('wallet.agentcash_solana', solAccount.address);
      }
    } catch {
      // Output wasn't JSON or didn't have Solana — will fetch on next load
    }

    const wallet = await getWalletBalance();
    return NextResponse.json({ ok: true, evmAddress: wallet.evmAddressFull });
  } catch {
    return NextResponse.json(
      { error: 'Wallet creation failed. Please try again.' },
      { status: 500 }
    );
  }
}
