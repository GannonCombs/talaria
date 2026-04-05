import { NextRequest, NextResponse } from 'next/server';
import { fetchBankrateRates, getLatestRate } from '@/lib/modules/housing/bankrate';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const refresh = params.get('refresh') === 'true';

  if (refresh) {
    const rates = await fetchBankrateRates({
      purchasePrice: Number(params.get('purchasePrice')) || undefined,
      downPayment: Number(params.get('downPayment')) || undefined,
      creditScore: Number(params.get('creditScore')) || undefined,
      zipCode: params.get('zipCode') || undefined,
    });
    return NextResponse.json(rates);
  }

  // Return latest cached rate
  const product = params.get('product') || '30yr_fixed';
  const rate = getLatestRate(product);
  return NextResponse.json(rate);
}
