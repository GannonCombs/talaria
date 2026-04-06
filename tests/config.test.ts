import { describe, it, expect } from 'vitest';
import { DEMO_MODE } from '@/lib/config';
import { SCHEMA_VERSION, DEFAULT_PREFERENCES, DEFAULT_MODULES } from '@/lib/schema';

describe('config', () => {
  it('DEMO_MODE is off', () => {
    expect(DEMO_MODE).toBe(false);
  });
});

describe('schema', () => {
  it('has a valid schema version', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
  });

  it('has required default preferences', () => {
    expect(DEFAULT_PREFERENCES).toHaveProperty('name');
    expect(DEFAULT_PREFERENCES).toHaveProperty('city');
    expect(DEFAULT_PREFERENCES).toHaveProperty('state');
    expect(DEFAULT_PREFERENCES).toHaveProperty('daily_spend_limit');
    expect(DEFAULT_PREFERENCES).toHaveProperty('low_balance_alert');
  });

  it('has housing preferences with correct prefix', () => {
    const housingKeys = Object.keys(DEFAULT_PREFERENCES).filter((k) => k.startsWith('housing.'));
    expect(housingKeys.length).toBeGreaterThan(0);
    expect(DEFAULT_PREFERENCES['housing.budget']).toBeDefined();
    expect(DEFAULT_PREFERENCES['housing.target_zips']).toBeDefined();
  });

  it('has all three default modules', () => {
    expect(DEFAULT_MODULES).toHaveLength(3);
    const ids = DEFAULT_MODULES.map((m) => m.id);
    expect(ids).toContain('housing');
    expect(ids).toContain('portfolio');
    expect(ids).toContain('food');
  });

  it('spending defaults are protective', () => {
    expect(DEFAULT_PREFERENCES['daily_spend_limit']).not.toBe('null');
    expect(Number(DEFAULT_PREFERENCES['daily_spend_limit'])).toBeGreaterThan(0);
    expect(Number(DEFAULT_PREFERENCES['low_balance_alert'])).toBeGreaterThan(0);
  });
});
