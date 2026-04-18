import { NextResponse } from 'next/server';
import { logMppTransaction } from '@/lib/mpp';

const SAMPLE_TRANSACTIONS = [
  // Tempo + USDC (the primary MPP rail)
  { service: 'RentCast', module: 'Housing', endpoint: '/v1/properties', rail: 'tempo', costUsd: 0.03, via: 'usdc' },
  { service: 'Mapbox', module: 'Housing', endpoint: '/v1/isochrone', rail: 'tempo', costUsd: 0.01, via: 'usdc' },
  { service: 'OpenAI', module: 'Portfolio', endpoint: '/v1/chat/completions', rail: 'tempo', costUsd: 0.08, via: 'usdc' },
  { service: 'Firecrawl', module: 'Housing', endpoint: '/v2/crawl', rail: 'tempo', costUsd: 0.005, via: 'usdc' },

  // Card + Visa
  { service: 'Whole Foods', module: 'Food', endpoint: null, rail: 'card', costUsd: 84.12, via: 'visa' },
  { service: 'Mortgage Payment', module: 'Housing', endpoint: null, rail: 'card', costUsd: 3240.00, via: 'visa' },

  // Card + Stripe (card)
  { service: 'DoorDash', module: 'Food', endpoint: '/v1/orders', rail: 'card', costUsd: 32.19, via: 'stripe' },
  { service: 'Anthropic', module: 'Portfolio', endpoint: '/v1/messages', rail: 'card', costUsd: 0.12, via: 'stripe' },

  // Card + Link (Stripe Link wallet)
  { service: 'Parallel', module: 'Portfolio', endpoint: '/v1/search', rail: 'card', costUsd: 0.05, via: 'link' },

  // Lightning + BTC
  { service: 'Lightspark', module: 'Portfolio', endpoint: '/v1/pay', rail: 'lightning', costUsd: 5.00, via: 'btc' },

  // Ethereum + ETH
  { service: 'Alchemy', module: 'Portfolio', endpoint: '/v2/eth', rail: 'ethereum', costUsd: 0.02, via: 'eth' },

  // Solana + SOL
  { service: 'Jupiter', module: 'Portfolio', endpoint: '/v1/swap', rail: 'solana', costUsd: 1.25, via: 'sol' },

  // Solana + USDC
  { service: 'Codex', module: 'Portfolio', endpoint: '/graphql', rail: 'solana', costUsd: 0.04, via: 'usdc' },

  // Base + USDC
  { service: 'Coinbase', module: 'Portfolio', endpoint: '/v2/trade', rail: 'base', costUsd: 15.00, via: 'usdc' },

  // Stellar + XLM
  { service: 'StellarPay', module: 'Portfolio', endpoint: '/v1/transfer', rail: 'stellar', costUsd: 2.50, via: 'xlm' },

  // Tempo + USDC (more examples)
  { service: 'ElevenLabs', module: 'Food', endpoint: '/v1/tts', rail: 'tempo', costUsd: 0.015, via: 'usdc' },
  { service: 'Alpha Vantage', module: 'Portfolio', endpoint: '/query', rail: 'tempo', costUsd: 0.00, via: 'usdc' },

  // Bank rail (ACH / direct bank transfer)
  { service: 'Ramp', module: 'Portfolio', endpoint: null, rail: 'bank', costUsd: 500.00, via: null },
  { service: 'Austin Energy', module: 'Housing', endpoint: null, rail: 'bank', costUsd: 112.50, via: null },
];

export async function POST() {
  for (const tx of SAMPLE_TRANSACTIONS) {
    await logMppTransaction({
      service: tx.service,
      module: tx.module,
      endpoint: tx.endpoint ?? undefined,
      rail: tx.rail,
      costUsd: tx.costUsd,
      metadata: { via: tx.via },
    });
  }

  return NextResponse.json({ ok: true, seeded: SAMPLE_TRANSACTIONS.length });
}
