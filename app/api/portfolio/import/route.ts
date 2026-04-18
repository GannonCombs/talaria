import { NextRequest, NextResponse } from 'next/server';
import { parseCsvFile } from '@/lib/modules/portfolio/parsers';
import { parseMerrillPdf } from '@/lib/modules/portfolio/pdf-parser';
import { getOrCreateAccount, insertTransactions } from '@/lib/modules/portfolio/holdings';

// POST: upload a CSV or PDF file.
export async function POST(request: NextRequest) {
  let csv: string | null = null;
  let pdfBuffer: Buffer | null = null;
  let accountNameOverride: string | undefined;
  let fileName = '';

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await request.json();
    csv = body.csv;
    accountNameOverride = body.accountName;
  } else if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    fileName = file.name.toLowerCase();
    const name = form.get('accountName');
    if (typeof name === 'string') accountNameOverride = name;

    // Detect PDF vs CSV by extension or content type
    if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      pdfBuffer = Buffer.from(arrayBuffer);
    } else {
      csv = await file.text();
    }
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  }

  // ── PDF import path ──
  if (pdfBuffer) {
    try {
      const result = await parseMerrillPdf(pdfBuffer);
      if (result.transactions.length === 0) {
        return NextResponse.json(
          { error: 'No positions found in PDF. Supported: Merrill ESPP, RSU, Vested Shares.' },
          { status: 400 }
        );
      }
      const accountName = accountNameOverride ?? result.accountName;
      const accountId = await getOrCreateAccount(accountName, 'brokerage');
      const inserted = await insertTransactions(accountId, result.transactions);
      return NextResponse.json({
        ok: true,
        format: `merrill-${result.documentType}`,
        accountName,
        parsedRows: result.transactions.length,
        insertedRows: inserted,
        duplicatesSkipped: result.transactions.length - inserted,
      });
    } catch (err) {
      console.error('[PDF import error]', err);
      return NextResponse.json(
        { error: 'PDF parsing failed', detail: (err as Error).message, stack: (err as Error).stack?.split('\n').slice(0, 3) },
        { status: 500 }
      );
    }
  }

  // ── CSV import path ──
  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'File content required' }, { status: 400 });
  }

  const result = parseCsvFile(csv);
  const { format, transactions } = result;

  if (format === 'unknown') {
    return NextResponse.json(
      { error: 'Unrecognized CSV format. Supported: Coinbase, Binance, Fidelity.' },
      { status: 400 }
    );
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: 'No transactions found in CSV', format },
      { status: 400 }
    );
  }

  // Fidelity: multi-account import (Individual, Roth IRA, 401K, etc.)
  if (result.perAccountTransactions && result.perAccountTransactions.size > 0) {
    let totalInserted = 0;
    let totalParsed = 0;
    const accountNames: string[] = [];

    for (const [acctName, acctTxs] of result.perAccountTransactions) {
      const name = accountNameOverride ?? acctName;
      const accountId = await getOrCreateAccount(name, 'brokerage');
      totalInserted += await insertTransactions(accountId, acctTxs);
      totalParsed += acctTxs.length;
      accountNames.push(name);
    }

    return NextResponse.json({
      ok: true,
      format,
      accountName: accountNames.join(', '),
      parsedRows: totalParsed,
      insertedRows: totalInserted,
      duplicatesSkipped: totalParsed - totalInserted,
    });
  }

  // Single-account import (Coinbase, Binance)
  const accountName = accountNameOverride ?? (format === 'coinbase' ? 'Coinbase' : 'Binance');
  const accountType = 'exchange';
  const accountId = await getOrCreateAccount(accountName, accountType);

  const inserted = await insertTransactions(accountId, transactions);

  return NextResponse.json({
    ok: true,
    format,
    accountName,
    parsedRows: transactions.length,
    insertedRows: inserted,
    duplicatesSkipped: transactions.length - inserted,
  });
}

export const maxDuration = 60;
