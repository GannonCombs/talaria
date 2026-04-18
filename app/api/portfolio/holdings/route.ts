import { NextResponse } from 'next/server';
import { getHoldings, getUnvestedHoldings, getAccounts } from '@/lib/modules/portfolio/holdings';

export async function GET() {
  const holdings = await getHoldings();
  const unvested = await getUnvestedHoldings();
  const accounts = await getAccounts();
  return NextResponse.json({ holdings, unvested, accounts });
}
