import { NextResponse } from 'next/server';
import { getWalletBalance } from '@/lib/wallet';

export async function GET() {
  const wallet = await getWalletBalance();
  return NextResponse.json(wallet);
}
