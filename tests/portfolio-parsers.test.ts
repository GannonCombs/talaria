import { describe, it, expect } from 'vitest';
import { detectFormat, parseCoinbase, parseBinance, parseFidelity } from '@/lib/modules/portfolio/parsers';

describe('detectFormat', () => {
  it('detects Coinbase format', () => {
    const csv = 'Transaction ID,Transaction Type,Date & time,Asset Acquired,"Quantity Acquired (Bought, Received, etc)",Cost Basis (incl. fees and/or spread) (USD),Data Source,"Asset Disposed (Sold, Sent, etc)",Quantity Disposed,Proceeds\n';
    expect(detectFormat(csv)).toBe('coinbase');
  });

  it('detects Binance format', () => {
    const csv = 'User ID,Time,Category,Operation,Order ID,Transaction ID,Primary Asset,Realized Amount For Primary Asset,Realized Amount for Primary Asset in USD,Base Asset,Realized Amount For Base Asset,Realized Amount For Base Asset In USD\n';
    expect(detectFormat(csv)).toBe('binance');
  });

  it('returns unknown for unrecognized format', () => {
    expect(detectFormat('foo,bar,baz\n1,2,3')).toBe('unknown');
  });
});

describe('parseCoinbase', () => {
  const header = 'Transaction ID,Transaction Type,Date & time,Asset Acquired,"Quantity Acquired (Bought, Received, etc)","Cost Basis (incl. fees and/or spread) (USD)",Data Source,"Asset Disposed (Sold, Sent, etc)",Quantity Disposed,"Proceeds (excl. fees and/or spread) (USD)"';

  it('parses a Buy as a positive quantity', () => {
    const csv = `${header}\nabc123,Buy,2021-01-13T22:55:46Z,BTC,0.00787195,300,Coinbase,,,`;
    const txs = parseCoinbase(csv);
    expect(txs).toHaveLength(1);
    expect(txs[0].asset).toBe('BTC');
    expect(txs[0].quantity).toBeCloseTo(0.00787195);
    expect(txs[0].usd_value).toBe(300);
    expect(txs[0].tx_type).toBe('buy');
  });

  it('parses a Send as a negative quantity', () => {
    const csv = `${header}\nabc456,Send,2021-01-15T05:39:07Z,,,,,BTC,0.00012177,4.64`;
    const txs = parseCoinbase(csv);
    expect(txs).toHaveLength(1);
    expect(txs[0].asset).toBe('BTC');
    expect(txs[0].quantity).toBeCloseTo(-0.00012177);
    expect(txs[0].tx_type).toBe('send');
  });

  it('parses a Converted from/to as two legs', () => {
    const csv = [
      header,
      'conv1,Converted from,2021-02-09T03:02:54Z,,,,,ETH,0.28943476,499.99',
      'conv2,Converted to,2021-02-09T03:02:55Z,UNI,25.72077858,499.99,Coinbase,,,',
    ].join('\n');
    const txs = parseCoinbase(csv);
    expect(txs).toHaveLength(2);
    expect(txs[0].asset).toBe('ETH');
    expect(txs[0].quantity).toBeCloseTo(-0.28943476);
    expect(txs[1].asset).toBe('UNI');
    expect(txs[1].quantity).toBeCloseTo(25.72077858);
  });

  it('parses Reward as positive', () => {
    const csv = `${header}\nrew1,Reward,2021-02-20T00:38:22Z,CGLD,0.38062613,2.00,Coinbase,,,`;
    const txs = parseCoinbase(csv);
    expect(txs).toHaveLength(1);
    expect(txs[0].asset).toBe('CGLD');
    expect(txs[0].quantity).toBeGreaterThan(0);
  });

  it('handles Asset rebranding (MATIC → POL)', () => {
    const csv = [
      header,
      'rebrand1,Asset rebranding remediation,2025-10-17T18:09:41Z,,,,,MATIC,91.859,0',
      'rebrand2,Asset rebranding remediation,2025-10-17T18:09:41Z,POL,91.859,0,Not available,,,',
    ].join('\n');
    const txs = parseCoinbase(csv);
    expect(txs).toHaveLength(2);
    const matic = txs.find((t) => t.asset === 'MATIC');
    const pol = txs.find((t) => t.asset === 'POL');
    expect(matic!.quantity).toBeCloseTo(-91.859);
    expect(pol!.quantity).toBeCloseTo(91.859);
  });

  it('returns empty for empty CSV', () => {
    expect(parseCoinbase('')).toHaveLength(0);
    expect(parseCoinbase(header)).toHaveLength(0);
  });
});

describe('parseBinance', () => {
  const header = 'User ID,Time,Category,Operation,Order ID,Transaction ID,Primary Asset,Realized Amount For Primary Asset,Realized Amount for Primary Asset in USD,Base Asset,Realized Amount For Base Asset,Realized Amount For Base Asset In USD,Quote Asset,Realized Amount for Quote Asset,Realized Amount for Quote Asset in USD,Fee Asset,Realized Amount for Fee Asset,Realized Amount for Fee Asset in USD,Payment Method,Withdraw Method,Additional Note';

  it('parses a Buy (crypto acquired, USD spent) — only records crypto', () => {
    const csv = `${header}\n54229086,2021-05-24 04:47:59,Buy,Buy,order1,tx1,"","","",USD,382.348,382.348,ETH,0.18,475.846,USD,1.91,1.91,Wallet,"",""`;
    const txs = parseBinance(csv);
    // Should have the crypto acquisition + fee, NOT a negative USD entry
    const ethTx = txs.find((t) => t.asset === 'ETH' && t.tx_type === 'buy');
    expect(ethTx).toBeDefined();
    expect(ethTx!.quantity).toBeCloseTo(0.18);
    // Should NOT have a negative USD holding
    const usdTx = txs.find((t) => t.asset === 'USD' && t.quantity < 0);
    expect(usdTx).toBeUndefined();
  });

  it('parses a Spot Trading Buy — records crypto, not USD payment', () => {
    const csv = `${header}\n54229086,2021-05-14 16:08:04,Spot Trading,Buy,order2,tx2,"","","",BTC,0.010039,500.75,USD,514.498,514.498,BTC,0.00001004,0.50,Wallet,"",""`;
    const txs = parseBinance(csv);
    const btcTx = txs.find((t) => t.asset === 'BTC' && t.tx_type === 'buy');
    expect(btcTx).toBeDefined();
    expect(btcTx!.quantity).toBeCloseTo(0.010039);
    const usdTx = txs.find((t) => t.asset === 'USD' && t.quantity < 0);
    expect(usdTx).toBeUndefined();
  });

  it('records fee as negative quantity', () => {
    const csv = `${header}\n54229086,2021-05-14 16:08:04,Spot Trading,Buy,order2,tx2,"","","",BTC,0.010039,500.75,USD,514.498,514.498,BTC,0.00001004,0.50,Wallet,"",""`;
    const txs = parseBinance(csv);
    const feeTx = txs.find((t) => t.tx_type === 'fee');
    expect(feeTx).toBeDefined();
    expect(feeTx!.asset).toBe('BTC');
    expect(feeTx!.quantity).toBeCloseTo(-0.00001004);
  });

  it('returns empty for empty CSV', () => {
    expect(parseBinance('')).toHaveLength(0);
    expect(parseBinance(header)).toHaveLength(0);
  });
});

describe('detectFormat — Fidelity', () => {
  it('detects Fidelity format', () => {
    const csv = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today\'s Gain/Loss Dollar,Today\'s Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type\n';
    expect(detectFormat(csv)).toBe('fidelity');
  });

  it('detects Fidelity with BOM', () => {
    const csv = '\uFEFFAccount Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today\'s Gain/Loss Dollar,Today\'s Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type\n';
    expect(detectFormat(csv)).toBe('fidelity');
  });
});

describe('parseFidelity', () => {
  const header = 'Account Number,Account Name,Symbol,Description,Quantity,Last Price,Last Price Change,Current Value,Today\'s Gain/Loss Dollar,Today\'s Gain/Loss Percent,Total Gain/Loss Dollar,Total Gain/Loss Percent,Percent Of Account,Cost Basis Total,Average Cost Basis,Type';

  it('parses an equity position', () => {
    const csv = `${header}\nX123,Individual,NVDA,NVIDIA CORPORATION COM,20,$198.35,-$0.52,$3967.00,-$10.40,-0.27%,+$1598.80,+67.51%,2.68%,$2368.20,$118.41,Margin,`;
    const { transactions } = parseFidelity(csv);
    const nvda = transactions.find((t) => t.asset === 'NVDA');
    expect(nvda).toBeDefined();
    expect(nvda!.quantity).toBe(20);
    expect(nvda!.usd_value).toBeCloseTo(2368.20);
    expect(nvda!.tx_type).toBe('snapshot');
  });

  it('parses money market as USD', () => {
    const csv = `${header}\nX123,Individual,SPAXX**,HELD IN MONEY MARKET,,,,$136263.17,,,,,92.22%,,,Cash,`;
    const { transactions } = parseFidelity(csv);
    const usd = transactions.find((t) => t.asset === 'USD');
    expect(usd).toBeDefined();
    expect(usd!.quantity).toBeCloseTo(136263.17);
  });

  it('skips escrow positions with -- price', () => {
    const csv = `${header}\nX123,Individual,901ESC012,CHROME HOLDING CO ESCROW,5,--,--,--,--,--,--,--,0.00%,$1491.86,$298.37,Margin,`;
    const { transactions } = parseFidelity(csv);
    expect(transactions).toHaveLength(0);
  });

  it('renames numeric fund codes to descriptions', () => {
    const csv = `${header}\n89980,VISA 401K PLAN,92204E878,VANGUARD TARGET 2050,2200.861,$85.57,+$0.36,$188327.67,$0.00,0.00%,+$10288.35,+5.78%,100.00%,$178039.32,$80.90,,`;
    const { transactions } = parseFidelity(csv);
    const vt = transactions.find((t) => t.asset === 'VANGUARD TARGET 2050');
    expect(vt).toBeDefined();
    expect(vt!.quantity).toBeCloseTo(2200.861);
  });

  it('renames BTC ETF to avoid crypto collision', () => {
    const csv = `${header}\nX123,Roth IRA,BTC,GRAYSCALE BITCOIN MINI TR ETF SHS NEW,23,$33.36,+$0.15,$767.28,+$3.45,+0.45%,+$340.33,+79.71%,1.98%,$426.95,$18.56,Cash,`;
    const { transactions } = parseFidelity(csv);
    const btc = transactions.find((t) => t.asset === 'BTC-ETF');
    expect(btc).toBeDefined();
    expect(btc!.quantity).toBe(23);
  });

  it('renames ETH ETF to avoid crypto collision', () => {
    const csv = `${header}\nX123,Roth IRA,ETH,GRAYSCALE ETHEREUM STAKING MINI ETF,8,$22.40,-$0.15,$179.20,-$1.20,-0.67%,+$55.38,+44.72%,0.46%,$123.82,$15.48,Cash,`;
    const { transactions } = parseFidelity(csv);
    const eth = transactions.find((t) => t.asset === 'ETH-ETF');
    expect(eth).toBeDefined();
    expect(eth!.quantity).toBe(8);
  });

  it('stores snapshot price in metadata', () => {
    const csv = `${header}\nX123,Individual,NVDA,NVIDIA CORPORATION COM,20,$198.35,-$0.52,$3967.00,-$10.40,-0.27%,+$1598.80,+67.51%,2.68%,$2368.20,$118.41,Margin,`;
    const { transactions } = parseFidelity(csv);
    const nvda = transactions.find((t) => t.asset === 'NVDA');
    expect(nvda!.metadata).toBeDefined();
    expect((nvda!.metadata as Record<string, unknown>).snapshotPrice).toBe(198.35);
  });

  it('consolidates all accounts under Fidelity', () => {
    const csv = [
      header,
      'X123,Individual,NVDA,NVIDIA,20,$198.35,-$0.52,$3967.00,-$10.40,-0.27%,+$1598.80,+67.51%,2.68%,$2368.20,$118.41,Margin,',
      '456,Roth IRA,GOOG,ALPHABET,10,$332.77,-$1.70,$3327.70,-$17.00,-0.51%,+$1327.00,+66.0%,22%,$2000.70,$200.07,Cash,',
    ].join('\n');
    const { accountName } = parseFidelity(csv);
    expect(accountName).toBe('Fidelity');
  });

  it('returns empty for empty CSV', () => {
    expect(parseFidelity('').transactions).toHaveLength(0);
    expect(parseFidelity(header).transactions).toHaveLength(0);
  });
});
