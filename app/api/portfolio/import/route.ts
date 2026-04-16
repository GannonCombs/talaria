import { NextRequest, NextResponse } from 'next/server';
import { parseCsvFile } from '@/lib/modules/portfolio/parsers';
import { getOrCreateAccount, insertTransactions } from '@/lib/modules/portfolio/holdings';

// POST: upload a CSV file. Body can be:
//   - multipart/form-data with 'file' field, or
//   - JSON with { csv: '...', accountName?: 'Coinbase' }
export async function POST(request: NextRequest) {
  let csv: string;
  let accountNameOverride: string | undefined;

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
    csv = await file.text();
    const name = form.get('accountName');
    if (typeof name === 'string') accountNameOverride = name;
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 400 });
  }

  if (!csv || typeof csv !== 'string') {
    return NextResponse.json({ error: 'CSV content required' }, { status: 400 });
  }

  const { format, transactions } = parseCsvFile(csv);

  if (format === 'unknown') {
    return NextResponse.json(
      { error: 'Unrecognized CSV format. Supported: Coinbase, Binance.' },
      { status: 400 }
    );
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: 'No transactions found in CSV', format },
      { status: 400 }
    );
  }

  const accountName = accountNameOverride ?? (format === 'coinbase' ? 'Coinbase' : 'Binance');
  const accountType = 'exchange';
  const accountId = getOrCreateAccount(accountName, accountType);

  const inserted = insertTransactions(accountId, transactions);

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
