import { NextRequest, NextResponse } from 'next/server';
import { calculateMortgage, rateSensitivity } from '@/lib/modules/housing/mortgage';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const breakdown = calculateMortgage({
    homePrice: body.homePrice,
    downPaymentPct: body.downPaymentPct,
    interestRate: body.interestRate,
    loanTermYears: body.loanTermYears,
    annualPropertyTax: body.annualPropertyTax,
    annualInsurance: body.annualInsurance,
    monthlyHoa: body.monthlyHoa,
  });

  const sensitivity = body.includeSensitivity
    ? rateSensitivity({
        homePrice: body.homePrice,
        downPaymentPct: body.downPaymentPct,
        currentRate: body.interestRate,
        loanTermYears: body.loanTermYears,
        annualPropertyTax: body.annualPropertyTax,
      })
    : undefined;

  return NextResponse.json({ breakdown, sensitivity });
}
