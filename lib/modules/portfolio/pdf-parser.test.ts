import { describe, it, expect } from 'vitest';
import {
  detectMerrillType,
  extractTickerInfo,
  extractCashBalance,
  parseHoldingsRows,
  parseRsuRows,
} from './pdf-parser';

// ── detectMerrillType ──────────────────────────────────────────────────

describe('detectMerrillType', () => {
  it('detects RSU documents', () => {
    expect(detectMerrillType('RSU/AR Share 109')).toBe('rsu');
    expect(detectMerrillType('Restricted Unit Balance something')).toBe('rsu');
  });

  it('detects vested share documents', () => {
    expect(detectMerrillType('Source Lapse Open 25')).toBe('vested');
  });

  it('detects ESPP documents', () => {
    expect(detectMerrillType('$268.26QualifiedOpen2')).toBe('espp');
    expect(detectMerrillType('$168.24Disqualified9/2/2026Open2')).toBe('espp');
  });

  it('returns unknown for unrecognized text', () => {
    expect(detectMerrillType('some random text')).toBe('unknown');
  });

  // Vested doc has "Lapse" but no "Qualified" — make sure order matters
  it('does not misclassify vested as ESPP', () => {
    expect(detectMerrillType('Lapse Open 25 more text here')).toBe('vested');
  });

  // ESPP doc has both "Qualified" and "Lapse" — Qualified wins since RSU check is first,
  // but this doc doesn't have RSU/AR, so it falls through to ESPP
  it('classifies doc with both Lapse and Qualified as ESPP', () => {
    expect(detectMerrillType('Lapse something Qualified something')).toBe('espp');
  });
});

// ── extractTickerInfo ──────────────────────────────────────────────────

describe('extractTickerInfo', () => {
  it('extracts from holdings format (V - $317.83 as of)', () => {
    const result = extractTickerInfo('V - $317.830000 as of 12:36:32 PM');
    expect(result).toEqual({ ticker: 'V', currentPrice: 317.83 });
  });

  it('extracts from RSU format (V $315.10 on its own line)', () => {
    const text = 'Key Facts\nV $315.10\nClosing Price';
    const result = extractTickerInfo(text);
    expect(result).toEqual({ ticker: 'V', currentPrice: 315.10 });
  });

  it('returns null for unrecognized text', () => {
    expect(extractTickerInfo('no ticker here')).toBeNull();
  });
});

// ── extractCashBalance ─────────────────────────────────────────────────

describe('extractCashBalance', () => {
  it('extracts cash from ESPP header', () => {
    const text = 'Cash Balance (The entire balance may not be available)\nUSD $525.63\nTransfer Money';
    expect(extractCashBalance(text)).toBe(525.63);
  });

  it('extracts cash with comma formatting', () => {
    const text = 'Cash Balance stuff\nUSD $1,234.56';
    expect(extractCashBalance(text)).toBe(1234.56);
  });

  it('returns 0 when no cash balance found', () => {
    expect(extractCashBalance('no cash here')).toBe(0);
  });
});

// ── parseHoldingsRows (ESPP) ───────────────────────────────────────────

describe('parseHoldingsRows (ESPP)', () => {
  // Simulated pdf-parse output for a few ESPP lots
  // In real pdf-parse output the "Plan Rule - MM/DD/YYYY" date is inline,
  // not on its own line, so the date regex doesn't capture it as an acquisition date.
  const esppText = [
    'V - $317.830000 as of 12:36:32 PM',
    '2$183.700000$367.40',
    'USD\n$635.66\n$268.26QualifiedOpen2',
    '3$167.360000$502.08',
    'USD\n$953.49\n$451.41QualifiedOpen3',
    '2$293.680000$587.36',
    'USD\n$635.66\n$48.30Disqualified3/2/2027\nRestricted per Plan Rule - 04/30/2026\n0',
    '02/28/2022',
    '06/30/2022',
    '04/30/2025',
  ].join('\n');

  it('parses ESPP lots with correct quantities and costs', () => {
    const txs = parseHoldingsRows(esppText, 'V', 'espp');
    expect(txs.length).toBe(3);

    expect(txs[0].quantity).toBe(2);
    expect(txs[0].usd_value).toBe(367.40);
    expect(txs[0].tx_type).toBe('espp');
    expect(txs[0].asset).toBe('V');

    expect(txs[1].quantity).toBe(3);
    expect(txs[1].usd_value).toBe(502.08);
  });

  it('assigns dates in order to rows', () => {
    const txs = parseHoldingsRows(esppText, 'V', 'espp');
    expect(txs[0].timestamp).toBe('2022-02-28T00:00:00Z');
    expect(txs[1].timestamp).toBe('2022-06-30T00:00:00Z');
    expect(txs[2].timestamp).toBe('2025-04-30T00:00:00Z');
  });

  it('tags restricted lots with metadata', () => {
    const txs = parseHoldingsRows(esppText, 'V', 'espp');
    const restricted = txs.find((t) => t.metadata?.restricted);
    expect(restricted).toBeDefined();
    expect(restricted!.quantity).toBe(2);
    expect(restricted!.metadata?.restrictedUntil).toBe('2026-04-30');
  });

  it('does not tag non-restricted lots', () => {
    const txs = parseHoldingsRows(esppText, 'V', 'espp');
    expect(txs[0].metadata?.restricted).toBeUndefined();
    expect(txs[1].metadata?.restricted).toBeUndefined();
  });

  it('stores unit cost in metadata', () => {
    const txs = parseHoldingsRows(esppText, 'V', 'espp');
    expect(txs[0].metadata?.unitCost).toBe(183.70);
    expect(txs[0].metadata?.source).toBe('ESPP');
  });

  it('does not confuse restriction dates with acquisition dates', () => {
    // Even if pdf-parse puts the Plan Rule date on its own line,
    // it should not be treated as an acquisition date
    const textWithSplitDate = [
      '2$183.700000$367.40',
      'USD\n$635.66\n$268.26QualifiedOpen2',
      '2$293.680000$587.36',
      'USD\n$635.66\n$48.30Disqualified3/2/2027',
      'Restricted per',
      'Plan Rule -',
      '04/30/2026',
      '0',
      '02/28/2022',
      '09/30/2025',
    ].join('\n');
    const txs = parseHoldingsRows(textWithSplitDate, 'V', 'espp');
    expect(txs.length).toBe(2);
    // First lot gets first real acquisition date
    expect(txs[0].timestamp).toBe('2022-02-28T00:00:00Z');
    // Second (restricted) lot gets second real acquisition date
    expect(txs[1].timestamp).toBe('2025-09-30T00:00:00Z');
    expect(txs[1].metadata?.restricted).toBe(true);
  });

  it('skips total rows', () => {
    const textWithTotal = [
      '2$183.700000$367.40',
      'USD\n$635.66\n$268.26QualifiedOpen2',
      'Total125$28,577.53',
      'USD\n$39,728.75\n$11,151.22',
      '02/28/2022',
    ].join('\n');
    const txs = parseHoldingsRows(textWithTotal, 'V', 'espp');
    expect(txs.length).toBe(1);
    expect(txs[0].quantity).toBe(2);
  });
});

// ── parseHoldingsRows (Vested) ─────────────────────────────────────────

describe('parseHoldingsRows (Vested)', () => {
  const vestedText = [
    'V - $317.610000 as of 12:33:42 PM',
    '25$311.850000$7,796.25',
    'USD\n$7,940.25\n$144.00Lapse Open 25',
    '39$324.120000$12,640.68',
    'USD\n$12,386.79\n($253.89)39',
    '11/19/2024',
    '11/19/2025',
  ].join('\n');

  it('parses vested lots as vest tx_type', () => {
    const txs = parseHoldingsRows(vestedText, 'V', 'vested');
    expect(txs.length).toBe(2);
    expect(txs[0].tx_type).toBe('vest');
    expect(txs[0].quantity).toBe(25);
    expect(txs[0].usd_value).toBe(7796.25);
    expect(txs[1].quantity).toBe(39);
    expect(txs[1].usd_value).toBe(12640.68);
  });

  it('sets source to Vested RSU', () => {
    const txs = parseHoldingsRows(vestedText, 'V', 'vested');
    expect(txs[0].metadata?.source).toBe('Vested RSU');
  });
});

// ── parseRsuRows ───────────────────────────────────────────────────────

describe('parseRsuRows', () => {
  // Simulated pdf-parse output for RSU grants
  const rsuText = [
    '11/19/2023RSU/ARShare10937037$315.100000$11,658.70',
    '11/19/2024RSU/ARShare6242042$315.100000$13,234.20',
    '11/19/2025RSU/ARShare1031030103$315.100000$32,455.30',
  ].join('\n');

  it('parses all three RSU grants', () => {
    const txs = parseRsuRows(rsuText, 'V');
    expect(txs.length).toBe(3);
  });

  it('extracts correct grant sizes and balances', () => {
    const txs = parseRsuRows(rsuText, 'V');

    // Grant 1: 109 granted, 37 current
    expect(txs[0].metadata?.unitsGranted).toBe(109);
    expect(txs[0].quantity).toBe(37);

    // Grant 2: 62 granted, 42 current
    expect(txs[1].metadata?.unitsGranted).toBe(62);
    expect(txs[1].quantity).toBe(42);

    // Grant 3: 103 granted, 103 current
    expect(txs[2].metadata?.unitsGranted).toBe(103);
    expect(txs[2].quantity).toBe(103);
  });

  it('sets correct dates', () => {
    const txs = parseRsuRows(rsuText, 'V');
    expect(txs[0].timestamp).toBe('2023-11-19T00:00:00Z');
    expect(txs[1].timestamp).toBe('2024-11-19T00:00:00Z');
    expect(txs[2].timestamp).toBe('2025-11-19T00:00:00Z');
  });

  it('marks all as unvested with zero cost basis', () => {
    const txs = parseRsuRows(rsuText, 'V');
    for (const tx of txs) {
      expect(tx.tx_type).toBe('rsu');
      expect(tx.usd_value).toBe(0);
      expect(tx.metadata?.unvested).toBe(true);
      expect(tx.metadata?.source).toBe('RSU (unvested)');
    }
  });

  it('captures snapshot price and total income', () => {
    const txs = parseRsuRows(rsuText, 'V');
    expect(txs[0].metadata?.snapshotPrice).toBe(315.10);
    expect(txs[0].metadata?.totalIncome).toBe(11658.70);
    expect(txs[2].metadata?.totalIncome).toBe(32455.30);
  });

  it('handles total of 182 unvested shares', () => {
    const txs = parseRsuRows(rsuText, 'V');
    const total = txs.reduce((sum, t) => sum + t.quantity, 0);
    expect(total).toBe(182);
  });
});
