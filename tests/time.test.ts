import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTxnTimestamp, formatRelativeFromNow } from '@/lib/time';

describe('formatTxnTimestamp', () => {
  it('parses SQLite UTC strings as UTC, not local time', () => {
    // SQLite emits 'YYYY-MM-DD HH:MM:SS' with no TZ — this is UTC. The bug
    // we fixed earlier was treating the bare string as local, which would
    // produce a wrong displayed time. Verify that the same UTC instant
    // (04:30 UTC = 23:30 the previous day in Central) renders consistently
    // by checking that the formatted result mentions 'PM' and the prior day.
    const result = formatTxnTimestamp('2026-04-07 04:30:00');
    // 04:30 UTC on 2026-04-07 = 11:30 PM CDT on 2026-04-06
    expect(result).toContain('04/06');
    expect(result).toContain('11:30');
    expect(result).toMatch(/PM/);
    expect(result).toMatch(/CDT|CST/);
  });

  it('handles ISO-8601 with T separator', () => {
    const a = formatTxnTimestamp('2026-04-07 04:30:00');
    const b = formatTxnTimestamp('2026-04-07T04:30:00');
    expect(a).toBe(b);
  });

  it('formats midday UTC times in Central as expected', () => {
    // 18:00 UTC = 1:00 PM CDT
    const result = formatTxnTimestamp('2026-04-07 18:00:00');
    expect(result).toContain('04/07');
    expect(result).toContain('01:00');
    expect(result).toMatch(/PM/);
  });
});

describe('formatRelativeFromNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Pin "now" to a fixed instant so the math is deterministic.
    vi.setSystemTime(new Date('2026-04-07T20:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for timestamps under 30 seconds old', () => {
    expect(formatRelativeFromNow('2026-04-07 19:59:50')).toBe('just now');
    expect(formatRelativeFromNow('2026-04-07 20:00:00')).toBe('just now');
  });

  it('returns seconds for under-1-minute', () => {
    expect(formatRelativeFromNow('2026-04-07 19:59:15')).toBe('45s ago');
  });

  it('returns minutes for under-1-hour', () => {
    expect(formatRelativeFromNow('2026-04-07 19:55:00')).toBe('5m ago');
    expect(formatRelativeFromNow('2026-04-07 19:01:00')).toBe('59m ago');
  });

  it('returns hours for under-1-day', () => {
    expect(formatRelativeFromNow('2026-04-07 18:00:00')).toBe('2h ago');
    expect(formatRelativeFromNow('2026-04-06 21:00:00')).toBe('23h ago');
  });

  it('returns days for under-30-days', () => {
    expect(formatRelativeFromNow('2026-04-05 20:00:00')).toBe('2d ago');
    expect(formatRelativeFromNow('2026-03-15 20:00:00')).toBe('23d ago');
  });

  it('returns months beyond 30 days', () => {
    expect(formatRelativeFromNow('2026-02-01 20:00:00')).toBe('2mo ago');
  });

  it('accepts an ISO 8601 string with Z', () => {
    expect(formatRelativeFromNow('2026-04-07T19:55:00Z')).toBe('5m ago');
  });
});
