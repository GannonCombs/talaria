import { describe, it, expect } from 'vitest';
import { calculateMortgage, rateSensitivity } from '@/lib/modules/housing/mortgage';

describe('calculateMortgage', () => {
  it('calculates a standard 30yr fixed mortgage correctly', () => {
    const result = calculateMortgage({
      homePrice: 415000,
      downPaymentPct: 20,
      interestRate: 5.98,
      loanTermYears: 30,
    });

    expect(result.principal_interest).toBeGreaterThan(1900);
    expect(result.principal_interest).toBeLessThan(2100);
    expect(result.property_tax).toBeGreaterThan(600);
    expect(result.insurance).toBeGreaterThan(150);
    expect(result.pmi).toBe(0); // 20% down = no PMI
    expect(result.total_monthly).toBeGreaterThan(2700);
    expect(result.total_monthly).toBeLessThan(3100);
    expect(result.total_interest_lifetime).toBeGreaterThan(300000);
  });

  it('adds PMI when down payment is under 20%', () => {
    const result = calculateMortgage({
      homePrice: 400000,
      downPaymentPct: 10,
      interestRate: 6.0,
      loanTermYears: 30,
    });

    expect(result.pmi).toBeGreaterThan(0);
    // PMI = 0.5% of loan amount annually / 12
    const loanAmount = 400000 * 0.9;
    const expectedPmi = (loanAmount * 0.005) / 12;
    expect(result.pmi).toBeCloseTo(expectedPmi, 0);
  });

  it('returns zero PMI at exactly 20% down', () => {
    const result = calculateMortgage({
      homePrice: 500000,
      downPaymentPct: 20,
      interestRate: 5.5,
      loanTermYears: 30,
    });

    expect(result.pmi).toBe(0);
  });

  it('handles zero interest rate', () => {
    const result = calculateMortgage({
      homePrice: 300000,
      downPaymentPct: 20,
      interestRate: 0,
      loanTermYears: 30,
    });

    const loanAmount = 240000;
    expect(result.principal_interest).toBeCloseTo(loanAmount / 360, 0);
  });

  it('calculates 15yr mortgage with lower total interest', () => {
    const thirty = calculateMortgage({
      homePrice: 400000,
      downPaymentPct: 20,
      interestRate: 5.98,
      loanTermYears: 30,
    });

    const fifteen = calculateMortgage({
      homePrice: 400000,
      downPaymentPct: 20,
      interestRate: 5.25,
      loanTermYears: 15,
    });

    expect(fifteen.total_interest_lifetime).toBeLessThan(thirty.total_interest_lifetime);
    expect(fifteen.principal_interest).toBeGreaterThan(thirty.principal_interest);
  });

  it('uses provided tax and insurance overrides', () => {
    const result = calculateMortgage({
      homePrice: 400000,
      downPaymentPct: 20,
      interestRate: 6.0,
      loanTermYears: 30,
      annualPropertyTax: 12000,
      annualInsurance: 3000,
      monthlyHoa: 200,
    });

    expect(result.property_tax).toBeCloseTo(1000, 0);
    expect(result.insurance).toBeCloseTo(250, 0);
    expect(result.hoa).toBe(200);
  });
});

describe('rateSensitivity', () => {
  it('returns 5 scenarios at ±0.25% and ±0.50%', () => {
    const result = rateSensitivity({
      homePrice: 400000,
      downPaymentPct: 20,
      currentRate: 6.0,
      loanTermYears: 30,
    });

    expect(result).toHaveLength(5);
    expect(result[0].rateChange).toBe(-0.5);
    expect(result[1].rateChange).toBe(-0.25);
    expect(result[2].rateChange).toBe(0);
    expect(result[3].rateChange).toBe(0.25);
    expect(result[4].rateChange).toBe(0.5);
  });

  it('shows higher payments at higher rates', () => {
    const result = rateSensitivity({
      homePrice: 400000,
      downPaymentPct: 20,
      currentRate: 6.0,
      loanTermYears: 30,
    });

    for (let i = 1; i < result.length; i++) {
      expect(result[i].monthlyPayment).toBeGreaterThan(result[i - 1].monthlyPayment);
    }
  });
});
