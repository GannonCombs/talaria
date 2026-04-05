export interface MortgageCostBreakdown {
  principal_interest: number;
  property_tax: number;
  insurance: number;
  hoa: number;
  pmi: number;
  total_monthly: number;
  total_interest_lifetime: number;
  total_payments_lifetime: number;
}

export function calculateMortgage(params: {
  homePrice: number;
  downPaymentPct: number;
  interestRate: number;
  loanTermYears: number;
  annualPropertyTax?: number;
  annualInsurance?: number;
  monthlyHoa?: number;
}): MortgageCostBreakdown {
  const {
    homePrice,
    downPaymentPct,
    interestRate,
    loanTermYears,
    monthlyHoa = 0,
  } = params;

  const downPayment = homePrice * (downPaymentPct / 100);
  const loanAmount = homePrice - downPayment;
  const monthlyRate = interestRate / 100 / 12;
  const numPayments = loanTermYears * 12;

  // P&I via standard amortization formula
  let principalInterest: number;
  if (monthlyRate === 0) {
    principalInterest = loanAmount / numPayments;
  } else {
    const factor = Math.pow(1 + monthlyRate, numPayments);
    principalInterest = loanAmount * (monthlyRate * factor) / (factor - 1);
  }

  // Property tax: default 1.95% of home value (Travis County)
  const annualTax = params.annualPropertyTax ?? homePrice * 0.0195;
  const propertyTax = annualTax / 12;

  // Insurance: default 0.6% of home value
  const annualIns = params.annualInsurance ?? homePrice * 0.006;
  const insurance = annualIns / 12;

  // PMI: 0.5% of loan amount annually if down payment < 20%
  const pmi = downPaymentPct < 20 ? (loanAmount * 0.005) / 12 : 0;

  const totalMonthly = principalInterest + propertyTax + insurance + monthlyHoa + pmi;
  const totalPaymentsLifetime = totalMonthly * numPayments;
  const totalInterestLifetime = (principalInterest * numPayments) - loanAmount;

  return {
    principal_interest: Math.round(principalInterest * 100) / 100,
    property_tax: Math.round(propertyTax * 100) / 100,
    insurance: Math.round(insurance * 100) / 100,
    hoa: monthlyHoa,
    pmi: Math.round(pmi * 100) / 100,
    total_monthly: Math.round(totalMonthly * 100) / 100,
    total_interest_lifetime: Math.round(totalInterestLifetime * 100) / 100,
    total_payments_lifetime: Math.round(totalPaymentsLifetime * 100) / 100,
  };
}

export function rateSensitivity(params: {
  homePrice: number;
  downPaymentPct: number;
  currentRate: number;
  loanTermYears: number;
  annualPropertyTax?: number;
}): Array<{ rateChange: number; rate: number; monthlyPayment: number }> {
  const offsets = [-0.5, -0.25, 0, 0.25, 0.5];

  return offsets.map((offset) => {
    const rate = params.currentRate + offset;
    const result = calculateMortgage({
      homePrice: params.homePrice,
      downPaymentPct: params.downPaymentPct,
      interestRate: rate,
      loanTermYears: params.loanTermYears,
      annualPropertyTax: params.annualPropertyTax,
    });
    return {
      rateChange: offset,
      rate: Math.round(rate * 100) / 100,
      monthlyPayment: result.total_monthly,
    };
  });
}
