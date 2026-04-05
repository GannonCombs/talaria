import { NextRequest, NextResponse } from 'next/server';
import { fetchBankrateRates, getLatestRate } from '@/lib/modules/housing/bankrate';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const refresh = params.get('refresh') === 'true';

  if (refresh) {
    const rates = await fetchBankrateRates({
      homeValue: Number(params.get('homeValue')) || 550000,
      downPayment: Number(params.get('downPayment')) || 110000,
      loanTerm: (Number(params.get('loanTerm')) || 30) as 30 | 15,
      creditScore: (params.get('creditScore') as 'excellent' | 'good' | 'fair') || 'excellent',
      zipCode: params.get('zip') || '78745',
      loanType: (params.get('loanType') as 'conventional' | 'fha' | 'va') || 'conventional',
    });
    return NextResponse.json(rates);
  }

  // Return latest cached rate
  const product = params.get('product') || '30yr_fixed';
  const rate = getLatestRate(product);
  return NextResponse.json(rate);
}
