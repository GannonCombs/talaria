import { NextResponse } from 'next/server';
import { getHoldings, getAccounts } from '@/lib/modules/portfolio/holdings';

export async function GET() {
  const holdings = getHoldings();
  const accounts = getAccounts();
  return NextResponse.json({ holdings, accounts });
}
