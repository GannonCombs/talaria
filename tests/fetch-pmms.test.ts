import { describe, it, expect } from 'vitest';
import { parsePmmsCsv } from '../scripts/fetch-pmms.mjs';

describe('parsePmmsCsv', () => {
  it('parses a normal FRED CSV with the modern observation_date header', () => {
    const csv = [
      'observation_date,MORTGAGE30US',
      '2026-03-19,6.22',
      '2026-03-26,6.38',
      '2026-04-02,6.46',
    ].join('\n');
    expect(parsePmmsCsv(csv)).toEqual([
      { date: '2026-03-19', value: 6.22 },
      { date: '2026-03-26', value: 6.38 },
      { date: '2026-04-02', value: 6.46 },
    ]);
  });

  it('also works with the legacy DATE header (column names skip by index)', () => {
    const csv = ['DATE,MORTGAGE30US', '1971-04-02,7.33'].join('\n');
    expect(parsePmmsCsv(csv)).toEqual([
      { date: '1971-04-02', value: 7.33 },
    ]);
  });

  it('skips rows with FRED-style "." missing values', () => {
    const csv = [
      'observation_date,MORTGAGE30US',
      '2026-03-19,6.22',
      '2026-03-26,.',
      '2026-04-02,6.46',
    ].join('\n');
    expect(parsePmmsCsv(csv)).toEqual([
      { date: '2026-03-19', value: 6.22 },
      { date: '2026-04-02', value: 6.46 },
    ]);
  });

  it('handles CRLF line endings', () => {
    const csv = 'observation_date,MORTGAGE30US\r\n2026-04-02,6.46\r\n';
    expect(parsePmmsCsv(csv)).toEqual([
      { date: '2026-04-02', value: 6.46 },
    ]);
  });

  it('returns an empty array when given only a header row', () => {
    expect(parsePmmsCsv('observation_date,MORTGAGE30US')).toEqual([]);
  });
});
