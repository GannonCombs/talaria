import { NextResponse } from 'next/server';
import { getHoldings, getUnvestedHoldings, getAccounts } from '@/lib/modules/portfolio/holdings';

export async function GET() {
  const holdings = getHoldings();
  const unvested = getUnvestedHoldings();
  const accounts = getAccounts();
  return NextResponse.json({ holdings, unvested, accounts });
}
