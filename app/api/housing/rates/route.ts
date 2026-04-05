import { NextRequest, NextResponse } from 'next/server';
import { fetchBankrateRates, getLatestRate } from '@/lib/modules/housing/bankrate';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const refresh = params.get('refresh') === 'true';

  if (refresh) {
    const opts: Record<string, unknown> = {};
    if (params.get('purchasePrice')) opts.purchasePrice = Number(params.get('purchasePrice'));
    if (params.get('downPayment')) opts.downPayment = Number(params.get('downPayment'));
    if (params.get('creditScore')) opts.creditScore = Number(params.get('creditScore'));
    if (params.get('zipCode')) opts.zipCode = params.get('zipCode');

    const rates = await fetchBankrateRates(opts);
    return NextResponse.json(rates);
  }

  const product = params.get('product') || '30yr_fixed';
  const rate = getLatestRate(product);
  return NextResponse.json(rate);
}
