import { NextResponse } from 'next/server';
import { getWalletBalance, createWallet } from '@/lib/wallet';

export async function GET() {
  const wallet = await getWalletBalance();
  return NextResponse.json(wallet);
}

export async function POST() {
  const result = await createWallet();
  return NextResponse.json({ ok: true, ...result });
}
