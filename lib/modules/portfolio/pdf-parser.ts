// PDF parser for Merrill Lynch Benefits Online documents.
// Handles three document types: ESPP, Vested Shares, and RSUs.
// Uses pdf-parse to extract text, then pattern-matches the data.

import type { ParsedTransaction } from './holdings';

interface PdfParseResult {
  transactions: ParsedTransaction[];
  accountName: string;
  documentType: 'espp' | 'rsu' | 'vested' | 'unknown';
}

export function detectMerrillType(text: string): 'espp' | 'rsu' | 'vested' | 'unknown' {
  if (text.includes('RSU/AR') || text.includes('Restricted Unit Balance')) return 'rsu';
  if (text.includes('Lapse') && !text.includes('Qualified')) return 'vested';
  if (text.includes('Qualified') || text.includes('Disqualified')) return 'espp';
  if (text.includes('Unit Cost') || text.includes('Cost\nBasis')) return 'espp';
  return 'unknown';
}

// Extract ticker and price: "V - $317.830000 as of" or "V $315.10"
export function extractTickerInfo(text: string): { ticker: string; currentPrice: number } | null {
  // Try "V - $317.83 as of" pattern
  let match = text.match(/([A-Z]{1,5})\s*-\s*\$([0-9.]+)\s*as of/);
  if (match) return { ticker: match[1], currentPrice: parseFloat(match[2]) };
  // Try "V $315.10\nClosing Price" pattern (RSU doc)
  match = text.match(/^([A-Z]{1,5})\s+\$([0-9.]+)\s*$/m);
  if (match) return { ticker: match[1], currentPrice: parseFloat(match[2]) };
  return null;
}

// Extract cash balance: "USD $525.63"
export function extractCashBalance(text: string): number {
  const match = text.match(/Cash Balance[\s\S]*?USD\s*\$([0-9,.]+)/);
  if (!match) return 0;
  return parseFloat(match[1].replace(/,/g, ''));
}

// Parse ESPP/Vested rows.
// pdf-parse outputs: "2$183.700000$367.40" (qty$unitCost$costBasis)
// followed by "USD", "$635.66" (market value), "$268.26QualifiedOpen2" (gain+metadata)
// Restricted lots have "Restricted per\nPlan Rule -\nMM/DD/YYYY" and available qty 0.
// Dates are on separate lines below in a block.
export function parseHoldingsRows(text: string, ticker: string, docType: 'espp' | 'vested'): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  // Match data rows: qty$unitCost$costBasis (no spaces)
  const rowPattern = /(\d+)\$([0-9.]+)\$([0-9,.]+)/g;
  const rows: Array<{ qty: number; unitCost: number; costBasis: number; endIndex: number }> = [];

  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const qty = parseInt(match[1], 10);
    const unitCost = parseFloat(match[2]);
    const costBasis = parseFloat(match[3].replace(/,/g, ''));

    // Skip if this looks like a Total row (qty > 100 for ESPP, or matches total pattern)
    // Also skip if unitCost looks like a cost basis (> 1000 for unit cost)
    if (unitCost < 1) continue; // not a real unit cost

    rows.push({ qty, unitCost, costBasis, endIndex: match.index + match[0].length });
  }

  // Collect acquisition dates (MM/DD/YYYY on their own lines).
  // Skip dates that immediately follow "Plan Rule -" — those are restriction
  // release dates, not acquisition dates.
  const datePattern = /^(\d{2}\/\d{2}\/\d{4})$/gm;
  const dates: string[] = [];
  while ((match = datePattern.exec(text)) !== null) {
    // Check the line(s) immediately before this date for "Plan Rule"
    const preceding = text.slice(Math.max(0, match.index - 30), match.index);
    if (/Plan Rule\s*-?\s*$/i.test(preceding)) continue;
    dates.push(match[1]);
  }

  // Match rows to dates. The dates appear in order after the data rows.
  // For ESPP: dates and rows should align 1:1
  // If we have more rows than dates, use the rows without dates
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const date = dates[i] ?? null;

    // Skip Total-like rows (where qty matches the total from a Total line)
    // Total line pattern: "Total125$28,577.53" — the qty is large
    if (r.qty >= 100 && r.costBasis > 10000) continue;

    // Check if this lot is restricted: look at the text between this row
    // and the next row for "Restricted" or available qty of 0
    const nextEnd = rows[i + 1]?.endIndex ?? text.length;
    const between = text.slice(r.endIndex, Math.min(r.endIndex + 300, nextEnd));
    const isRestricted = /Restricted/i.test(between);

    // Extract the restriction release date if present: "Plan Rule -\nMM/DD/YYYY"
    let restrictedUntil: string | null = null;
    if (isRestricted) {
      const releaseMatch = between.match(/Plan Rule\s*-\s*\n?(\d{2}\/\d{2}\/\d{4})/);
      if (releaseMatch) {
        const [m, d, y] = releaseMatch[1].split('/');
        restrictedUntil = `${y}-${m}-${d}`;
      }
    }

    const isoDate = date
      ? (() => { const [m, d, y] = date.split('/'); return `${y}-${m}-${d}T00:00:00Z`; })()
      : new Date().toISOString();

    const dateKey = date ?? `row-${i}`;

    out.push({
      external_id: `ml-${docType}-${ticker}-${dateKey}`,
      timestamp: isoDate,
      tx_type: docType === 'espp' ? 'espp' : 'vest',
      asset: ticker,
      quantity: r.qty,
      usd_value: r.costBasis,
      metadata: {
        unitCost: r.unitCost,
        source: docType === 'espp' ? 'ESPP' : 'Vested RSU',
        snapshotPrice: r.unitCost,
        ...(isRestricted ? { restricted: true, restrictedUntil } : {}),
      },
    });
  }

  return out;
}

// Parse RSU rows.
// pdf-parse outputs: "11/19/2023RSU/ARShare10937037$315.100000$11,658.70"
export function parseRsuRows(text: string, ticker: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];

  // Match: date + RSU/AR + Share + unitsGranted + beginBal + 0 + currentBal + $price + $income
  // The tricky part: "10937037" = 109, 37, 0, 37 but "1031030103" = 103, 103, 0, 103
  // We know activity is always 0, and currentBal = beginBal. So look for the pattern N 0 N $
  // Strategy: match from $price backwards — find $price$income, then work back
  const rowPattern = /(\d{2}\/\d{2}\/\d{4})RSU\/ARShare(\d+?)(\d+)0\3\$([0-9,.]+)\$([0-9,.]+)/g;

  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    const date = match[1];
    const unitsGranted = parseInt(match[2], 10);
    // match[3] is beginBal (= currentBal via backreference)
    const currentBalance = parseInt(match[3], 10);
    const pricePerUnit = parseFloat(match[4].replace(/,/g, ''));
    const totalIncome = parseFloat(match[5].replace(/,/g, ''));

    const [month, day, year] = date.split('/');
    const isoDate = `${year}-${month}-${day}T00:00:00Z`;

    out.push({
      external_id: `ml-rsu-${ticker}-${date}`,
      timestamp: isoDate,
      tx_type: 'rsu',
      asset: ticker,
      quantity: currentBalance,
      usd_value: 0,
      metadata: {
        unitsGranted,
        currentBalance,
        snapshotPrice: pricePerUnit,
        totalIncome,
        source: 'RSU (unvested)',
        unvested: true,
      },
    });
  }

  return out;
}

export async function parseMerrillPdf(buffer: Buffer): Promise<PdfParseResult> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const text = data.text;

  const docType = detectMerrillType(text);
  const tickerInfo = extractTickerInfo(text);

  if (!tickerInfo || docType === 'unknown') {
    return { transactions: [], accountName: 'Merrill', documentType: docType };
  }

  const { ticker } = tickerInfo;
  let transactions: ParsedTransaction[] = [];

  if (docType === 'espp' || docType === 'vested') {
    transactions = parseHoldingsRows(text, ticker, docType);

    const cash = extractCashBalance(text);
    if (cash > 0) {
      transactions.push({
        external_id: `ml-${docType}-cash`,
        timestamp: new Date().toISOString(),
        tx_type: 'snapshot',
        asset: 'USD',
        quantity: cash,
        usd_value: cash,
        metadata: { source: `Merrill ${docType.toUpperCase()} cash balance` },
      });
    }
  } else if (docType === 'rsu') {
    transactions = parseRsuRows(text, ticker);
  }

  return {
    transactions,
    accountName: 'Merrill',
    documentType: docType,
  };
}
