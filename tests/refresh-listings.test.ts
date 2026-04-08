import { describe, it, expect } from 'vitest';
import {
  inCooldownAt,
  COOLDOWN_MINUTES,
  type RefreshAttempt,
} from '@/app/api/housing/refresh-listings/route';

describe('inCooldownAt — cooldown decision logic', () => {
  // Pin a deterministic "now" so the math is reproducible. 2026-04-08 14:00 UTC.
  const NOW = new Date('2026-04-08T14:00:00Z').getTime();

  function attempt(minutesAgo: number): RefreshAttempt {
    return {
      city: 'Austin',
      state: 'TX',
      startedAt: new Date(NOW - minutesAgo * 60 * 1000).toISOString(),
    };
  }

  it('returns false when there is no prior attempt at all', () => {
    expect(inCooldownAt(null, NOW)).toBe(false);
  });

  it('returns true when the last attempt was just now', () => {
    expect(inCooldownAt(attempt(0), NOW)).toBe(true);
  });

  it('returns true when the last attempt was 30 minutes ago', () => {
    expect(inCooldownAt(attempt(30), NOW)).toBe(true);
  });

  it('returns true when the last attempt was 59 minutes ago (under cap)', () => {
    expect(inCooldownAt(attempt(59), NOW)).toBe(true);
  });

  it('returns false when the last attempt was 60 minutes ago (at cap)', () => {
    // 60 minutes is the boundary — the helper uses strict <, so >= 60 is OK to retry.
    expect(inCooldownAt(attempt(60), NOW)).toBe(false);
  });

  it('returns false when the last attempt was 90 minutes ago', () => {
    expect(inCooldownAt(attempt(90), NOW)).toBe(false);
  });

  it('returns false when the last attempt was a day ago', () => {
    expect(inCooldownAt(attempt(60 * 24), NOW)).toBe(false);
  });

  it('respects a custom cooldown window', () => {
    // 30-minute window: 25m ago = still locked, 35m ago = unlocked.
    expect(inCooldownAt(attempt(25), NOW, 30)).toBe(true);
    expect(inCooldownAt(attempt(35), NOW, 30)).toBe(false);
  });

  it('exports the default cooldown as 60 minutes', () => {
    expect(COOLDOWN_MINUTES).toBe(60);
  });
});
