import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateAccount, setManualBalance } from '@/lib/modules/portfolio/holdings';

// POST: set a manual balance for an account.
// Body: { accountName: 'Wells Fargo', accountType: 'bank', asset: 'USD', balance: 70000 }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accountName, accountType, asset, balance } = body;

  if (!accountName || typeof accountName !== 'string') {
    return NextResponse.json({ error: 'accountName required' }, { status: 400 });
  }
  if (!asset || typeof asset !== 'string') {
    return NextResponse.json({ error: 'asset required' }, { status: 400 });
  }
  if (typeof balance !== 'number' || isNaN(balance)) {
    return NextResponse.json({ error: 'balance must be a number' }, { status: 400 });
  }

  const accountId = await getOrCreateAccount(accountName, accountType ?? 'bank');
  await setManualBalance(accountId, asset, balance);

  return NextResponse.json({ ok: true, accountName, asset, balance });
}
