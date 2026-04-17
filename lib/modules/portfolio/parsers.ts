// CSV parsers for brokerage/exchange transaction exports.
// Each parser normalizes to ParsedTransaction[] and detects its own format
// by looking at the header row.

import type { ParsedTransaction } from './holdings';

export type BrokerFormat = 'coinbase' | 'binance' | 'fidelity' | 'unknown';

// Simple CSV parser — handles quoted fields with commas inside.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      }
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++;
      continue;
    }

    field += c;
    i++;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function detectFormat(csv: string): BrokerFormat {
  // Strip BOM
  const clean = csv.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] ?? '';
  if (firstLine.includes('Transaction ID') && firstLine.includes('Asset Acquired')) {
    return 'coinbase';
  }
  if (firstLine.includes('Realized Amount For Primary Asset') || firstLine.includes('Realized Amount For Base Asset')) {
    return 'binance';
  }
  if (firstLine.includes('Account Number') && firstLine.includes('Symbol') && firstLine.includes('Cost Basis Total')) {
    return 'fidelity';
  }
  return 'unknown';
}

// ── Coinbase parser ─────────────────────────────────────────────────────

export function parseCoinbase(csv: string): ParsedTransaction[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];

  const header = rows[0];
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);

  const iTxId = idx('Transaction ID');
  const iType = idx('Transaction Type');
  const iDate = idx('Date & time');
  const iAcquired = idx('Asset Acquired');
  const iQtyAcq = idx('Quantity Acquired (Bought, Received, etc)');
  const iCost = idx('Cost Basis (incl. fees and/or spread) (USD)');
  const iDisposed = idx('Asset Disposed (Sold, Sent, etc)');
  const iQtyDisp = idx('Quantity Disposed');
  const iProceeds = idx('Proceeds (excl. fees and/or spread) (USD)');

  if (iTxId < 0 || iType < 0 || iDate < 0) return [];

  const out: ParsedTransaction[] = [];
  const typeMap: Record<string, string> = {
    Buy: 'buy',
    Sell: 'sell',
    Send: 'send',
    Receive: 'receive',
    Reward: 'reward',
    Rewards: 'reward',
    Deposit: 'deposit',
    Withdrawal: 'withdraw',
    Convert: 'convert',
    'Converted from': 'convert',
    'Converted to': 'convert',
    Stake: 'stake',
    'Asset rebranding remediation': 'rebrand',
  };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[iTxId]) continue;

    const txId = row[iTxId].trim();
    const rawType = row[iType]?.trim() ?? '';
    const txType = typeMap[rawType] ?? rawType.toLowerCase();
    const timestamp = row[iDate]?.trim() ?? '';

    const acquired = row[iAcquired]?.trim();
    const qtyAcq = parseFloat(row[iQtyAcq] || '');
    const cost = parseFloat(row[iCost] || '');

    const disposed = row[iDisposed]?.trim();
    const qtyDisp = parseFloat(row[iQtyDisp] || '');
    const proceeds = parseFloat(row[iProceeds] || '');

    // Acquisition leg
    if (acquired && !isNaN(qtyAcq) && qtyAcq !== 0) {
      out.push({
        external_id: txId,
        timestamp,
        tx_type: txType,
        asset: acquired,
        quantity: qtyAcq,
        usd_value: isNaN(cost) ? null : cost,
      });
    }

    // Disposal leg (negative quantity)
    if (disposed && !isNaN(qtyDisp) && qtyDisp !== 0) {
      out.push({
        external_id: txId,
        timestamp,
        tx_type: txType,
        asset: disposed,
        quantity: -qtyDisp,
        usd_value: isNaN(proceeds) ? null : proceeds,
      });
    }
  }

  return out;
}

// ── Binance parser ──────────────────────────────────────────────────────

export function parseBinance(csv: string): ParsedTransaction[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];

  const header = rows[0];
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);

  const iTxId = idx('Transaction ID');
  const iTime = idx('Time');
  const iCategory = idx('Category');
  const iOp = idx('Operation');
  const iBaseAsset = idx('Base Asset');
  const iBaseAmt = idx('Realized Amount For Base Asset');
  const iBaseUsd = idx('Realized Amount For Base Asset In USD');
  const iQuoteAsset = idx('Quote Asset');
  const iQuoteAmt = idx('Realized Amount for Quote Asset');
  const iQuoteUsd = idx('Realized Amount for Quote Asset in USD');
  const iFeeAsset = idx('Fee Asset');
  const iFeeAmt = idx('Realized Amount for Fee Asset');

  if (iTxId < 0 || iTime < 0) return [];

  const out: ParsedTransaction[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[iTxId]) continue;

    const txId = row[iTxId].trim();
    const timestamp = row[iTime]?.trim() ?? '';
    const category = row[iCategory]?.trim() ?? '';
    const op = (row[iOp]?.trim() ?? '').toLowerCase();

    const baseAsset = row[iBaseAsset]?.trim();
    const baseAmt = parseFloat(row[iBaseAmt] || '');
    const baseUsd = parseFloat(row[iBaseUsd] || '');
    const quoteAsset = row[iQuoteAsset]?.trim();
    const quoteAmt = parseFloat(row[iQuoteAmt] || '');
    const quoteUsd = parseFloat(row[iQuoteUsd] || '');
    const feeAsset = row[iFeeAsset]?.trim();
    const feeAmt = parseFloat(row[iFeeAmt] || '');

    const txType = op || category.toLowerCase() || 'trade';

    // For Binance buys/sells, only record the acquired asset as a holding.
    // The payment side (USD spent on a buy, or crypto sold) is an expenditure,
    // not a holding. Cost basis is captured in usd_value.
    const isBuy = op === 'buy';
    const isSell = op === 'sell';
    const FIAT = new Set(['USD', 'USDT', 'USDC']);

    if (isBuy || isSell) {
      // Figure out which side is the acquired asset
      const baseIsFiat = FIAT.has(baseAsset ?? '');
      const quoteIsFiat = FIAT.has(quoteAsset ?? '');

      // On Buy: the non-fiat side is acquired. On Sell: the fiat side is received.
      if (isBuy) {
        // Record the crypto we received
        const cryptoAsset = baseIsFiat ? quoteAsset : baseAsset;
        const cryptoAmt = baseIsFiat ? quoteAmt : baseAmt;
        const costUsd = baseIsFiat ? baseUsd : quoteUsd;
        if (cryptoAsset && !isNaN(cryptoAmt) && cryptoAmt !== 0) {
          out.push({
            external_id: txId,
            timestamp,
            tx_type: 'buy',
            asset: cryptoAsset,
            quantity: cryptoAmt,
            usd_value: isNaN(costUsd) ? null : costUsd,
          });
        }
      } else {
        // Sell: record the fiat received as a deposit, and the crypto loss
        const cryptoAsset = baseIsFiat ? quoteAsset : baseAsset;
        const cryptoAmt = baseIsFiat ? quoteAmt : baseAmt;
        if (cryptoAsset && !isNaN(cryptoAmt) && cryptoAmt !== 0) {
          out.push({
            external_id: txId,
            timestamp,
            tx_type: 'sell',
            asset: cryptoAsset,
            quantity: -cryptoAmt,
            usd_value: null,
          });
        }
      }
    } else {
      // Non-buy/sell operations (deposit, withdraw, etc.) — record both sides
      if (baseAsset && !isNaN(baseAmt) && baseAmt !== 0) {
        out.push({
          external_id: txId,
          timestamp,
          tx_type: txType,
          asset: baseAsset,
          quantity: baseAmt,
          usd_value: isNaN(baseUsd) ? null : baseUsd,
        });
      }
      if (quoteAsset && !isNaN(quoteAmt) && quoteAmt !== 0) {
        out.push({
          external_id: txId,
          timestamp,
          tx_type: txType,
          asset: quoteAsset,
          quantity: quoteAmt,
          usd_value: isNaN(quoteUsd) ? null : quoteUsd,
        });
      }
    }

    // Fee — reduces the fee asset balance. Skip fiat fees on buys
    // (those are expenditures, not holding reductions).
    if (feeAsset && !isNaN(feeAmt) && feeAmt !== 0) {
      const feeIsFiat = FIAT.has(feeAsset);
      if (!(isBuy && feeIsFiat)) {
        out.push({
          external_id: txId + '-fee',
          timestamp,
          tx_type: 'fee',
          asset: feeAsset,
          quantity: -feeAmt,
          usd_value: null,
        });
      }
    }
  }

  return out;
}

// ── Fidelity parser ─────────────────────────────────────────────────────

// Fidelity exports a snapshot of current positions, not transaction history.
// Each row is a current holding. We create synthetic "snapshot" transactions
// with the current quantity and cost basis.

export function parseFidelity(csv: string): { transactions: ParsedTransaction[]; accountName: string } {
  // Strip BOM and disclaimer footer
  const clean = csv.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/);
  // Find where the disclaimer starts (blank line or line starting with ")
  const dataEnd = lines.findIndex((l, i) => i > 0 && (l.trim() === '' || l.startsWith('"The data')));
  const dataLines = dataEnd > 0 ? lines.slice(0, dataEnd) : lines;

  const rows = parseCsv(dataLines.join('\n'));
  if (rows.length < 2) return { transactions: [], accountName: 'Fidelity' };

  const header = rows[0];
  const idx = (name: string) => header.findIndex((h) => h.trim() === name);

  const iAcctNum = idx('Account Number');
  const iAcctName = idx('Account Name');
  const iSymbol = idx('Symbol');
  const iDesc = idx('Description');
  const iQty = idx('Quantity');
  const iPrice = idx('Last Price');
  const iValue = idx('Current Value');
  const iCostBasis = idx('Cost Basis Total');
  const iType = idx('Type');

  if (iSymbol < 0) return { transactions: [], accountName: 'Fidelity' };

  const out: ParsedTransaction[] = [];
  const accountNames = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const symbol = row[iSymbol]?.trim();
    if (!symbol) continue;

    const acctName = row[iAcctName]?.trim() ?? '';
    const acctNum = row[iAcctNum]?.trim() ?? '';
    const desc = row[iDesc]?.trim() ?? '';
    const qtyStr = row[iQty]?.trim();
    const priceStr = row[iPrice]?.trim();
    const valueStr = row[iValue]?.trim().replace(/[$,]/g, '');
    const costStr = row[iCostBasis]?.trim().replace(/[$,]/g, '');
    const type = row[iType]?.trim() ?? '';

    // Skip positions with no value (escrow, etc.)
    if (priceStr === '--' || valueStr === '--') continue;

    const accountLabel = 'Fidelity';
    accountNames.add(accountLabel);

    // Money market / cash positions (SPAXX**, CORE**)
    // Money market / cash sweep positions (SPAXX**, CORE**, FCASH**, etc.)
    // Note: type === 'Cash' means the account type (vs Margin), NOT that it's cash
    if (symbol.includes('**')) {
      const value = parseFloat(valueStr || '0');
      if (value > 0) {
        out.push({
          external_id: `fid-${acctNum}-${symbol}`,
          timestamp: new Date().toISOString(),
          tx_type: 'snapshot',
          asset: 'USD',
          quantity: value,
          usd_value: value,
          metadata: { account: accountLabel, symbol, description: desc },
        });
      }
      continue;
    }

    // Regular positions
    const qty = parseFloat(qtyStr || '0');
    const cost = parseFloat(costStr || '0');
    if (qty === 0) continue;

    // Use description as ticker for numeric fund codes (e.g. 92204E878 → VANGUARD TARGET 2050)
    let ticker = symbol;
    if (/^\d/.test(symbol) && desc) {
      ticker = desc.replace(/\s+(FD|FUND|SHS|SHARES|NEW)$/i, '').trim();
    }

    // Disambiguate ETF tickers that collide with crypto tickers on CoinGecko.
    // Fidelity's BTC = Grayscale Bitcoin Mini Trust ETF (~$33), not Bitcoin (~$74K).
    // Fidelity's ETH = Grayscale Ethereum Staking Mini ETF (~$22), not Ethereum (~$2.3K).
    // Rename so the prices route sends these to Finnhub (equities) not CoinGecko (crypto).
    const ETF_RENAMES: Record<string, string> = {
      BTC: 'BTC-ETF',
      ETH: 'ETH-ETF',
    };
    if (ETF_RENAMES[ticker]) {
      ticker = ETF_RENAMES[ticker];
    }

    const price = parseFloat(priceStr?.replace(/[$,]/g, '') || '0');
    const currentValue = parseFloat(valueStr || '0');

    out.push({
      external_id: `fid-${acctNum}-${ticker}`,
      timestamp: new Date().toISOString(),
      tx_type: 'snapshot',
      asset: ticker,
      quantity: qty,
      usd_value: cost > 0 ? cost : null,
      metadata: {
        account: accountLabel,
        description: desc,
        type,
        snapshotPrice: price > 0 ? price : undefined,
        snapshotValue: currentValue > 0 ? currentValue : undefined,
      },
    });
  }

  // Use the most common account name, or combine them
  const primaryAccount = accountNames.size === 1
    ? [...accountNames][0]
    : 'Fidelity';

  return { transactions: out, accountName: primaryAccount };
}

// ── Dispatch ────────────────────────────────────────────────────────────

export function parseCsvFile(csv: string): {
  format: BrokerFormat;
  transactions: ParsedTransaction[];
  accountName?: string;
  // For Fidelity: transactions include per-account metadata
  perAccountTransactions?: Map<string, ParsedTransaction[]>;
} {
  const format = detectFormat(csv);
  let transactions: ParsedTransaction[] = [];
  let accountName: string | undefined;

  if (format === 'coinbase') {
    transactions = parseCoinbase(csv);
  } else if (format === 'binance') {
    transactions = parseBinance(csv);
  } else if (format === 'fidelity') {
    const result = parseFidelity(csv);
    transactions = result.transactions;
    accountName = result.accountName;

    // Group by account for multi-account import
    const perAccount = new Map<string, ParsedTransaction[]>();
    for (const tx of transactions) {
      const acct = (tx.metadata as Record<string, string>)?.account ?? accountName ?? 'Fidelity';
      if (!perAccount.has(acct)) perAccount.set(acct, []);
      perAccount.get(acct)!.push(tx);
    }
    return { format, transactions, accountName, perAccountTransactions: perAccount };
  }

  return { format, transactions, accountName };
}
