# MPP Reseller Experiment — Future Work

> **STATUS: COMPLETED in Round 2 + Round 3.** This document is the original
> design proposal that motivated the reseller build. The actual experiment
> ran (Round 2 built the reseller, measured it across 16 sweep calls, and
> proved that Tempo's googlemaps proxy adds ~17 seconds of overhead the
> protocol doesn't require). See [docs/mpp-latency-findings.md](mpp-latency-findings.md)
> for the full results, including the Round 3 follow-up that wired the
> reseller into the housing module's listing photos and added a free
> Streetview metadata preflight to skip the 60% of Austin homes with no
> coverage. The proposal below is preserved as historical context for
> how this work got started.
>
> Authored 2026-04-08 as a follow-up to the listing-photo
> latency investigation. See also: feature branch `feat/listing-photos`.

## Why this matters

We added Google Maps Street View images to the housing listing drawer via
`googlemaps.mpp.tempo.xyz/maps/streetview` (a Tempo-operated proxy). The
integration works end-to-end and produces real photos of real houses, but
each cold call takes **15-17 seconds** end-to-end.

We instrumented the flow with a per-fetch wrapper around `globalThis.fetch`
and got this breakdown for one typical call:

| # | Time | Status | Method | URL |
|---|---|---|---|---|
| 1 | 271ms | 402 | GET | `googlemaps.mpp.tempo.xyz/maps/streetview?...` (initial challenge) |
| 2 | 188ms | 200 | POST | `rpc.tempo.xyz/` (viem chain setup) |
| 3 | 61ms | 200 | POST | `rpc.tempo.xyz/` (viem chain setup) |
| 4 | **15004ms** | 200 | GET | `googlemaps.mpp.tempo.xyz/maps/streetview?...` (paid retry) |

**96.7% of the latency is in a single Locus/Tempo proxy response after we
present a valid credential.** The on-chain payment work itself is ~250ms
total. Tempo blocks are 500-600ms — even waiting for several confirmations
should be ~2-3 seconds, not 15.

The remaining ~13 seconds is unexplained by anything we control. Theories:

1. The proxy waits for the tx to confirm with a polling interval that's
   too long for Tempo's block time
2. The proxy waits for many confirmations before honoring the credential
3. The proxy uses viem's default `pollingInterval` of 4 seconds, which is
   8× Tempo's block time
4. There's a cold-start tax on the proxy's serverless function
5. The upstream Google Maps call is the slow part

Without running our own reseller, we can't isolate which.

## What we found in mppx server source

`node_modules/mppx/dist/tempo/server/Charge.d.ts` exposes a single
boolean knob on the charge method:

```ts
type Parameters = {
  /**
   * Whether to wait for the charge transaction to confirm on-chain
   * before responding. @default true
   *
   * When `false`, the transaction is simulated via `eth_estimateGas`
   * and broadcast without waiting for inclusion.
   */
  waitForConfirmation?: boolean | undefined;
}
```

And in `node_modules/mppx/dist/tempo/server/internal/transport.d.ts`:

```ts
{ pollingInterval?: number | undefined }
```

So the server-side knobs we'd be testing are:
- `waitForConfirmation: false` (default `true`)
- `pollingInterval: 600` (default unspecified, likely viem's 4000ms)

Tempo's proxy is presumably using all defaults, which means:
- They wait for confirmation
- They probably poll every 4 seconds
- That alone could explain 4-8s of latency

## The experiment

Run our own Google Maps Street View reseller on Tempo mainnet, then time the
same call against both endpoints. If our reseller is fast, **the bottleneck
is server-side configuration in Tempo's proxy**, not the chain. If our
reseller is also slow, the bottleneck is deeper (chain finality model,
Tempo RPC behavior, viem internals).

### 4-quadrant timing matrix

| | Our reseller | Tempo's proxy |
|---|---|---|
| **Tempo testnet (Moderato)** | A | B |
| **Tempo mainnet** | C | D |

- **D** is what we already measured: ~15.5 seconds. Done.
- **C** is the most informative quadrant. Same chain as D, but we control
  every server-side knob. If C ≈ 1-2s, the chain is innocent and Tempo's
  proxy is conservative. If C ≈ 15s, something deeper is going on.
- **A** isolates testnet behavior. Free to run repeatedly while iterating.
- **B** is for completeness — we can probe Tempo's proxy on testnet if it
  exposes a testnet variant.

### Tunable knobs to test

Once the reseller is up, run **each variant** of the call against the same
listing and record the per-fetch breakdown:

| Variant | `waitForConfirmation` | `pollingInterval` (ms) | Expected behavior |
|---|---|---|---|
| 1. Default | `true` | unset (~4000) | Should match Tempo's ~15s if defaults are the cause |
| 2. Fast poll | `true` | `600` | Cuts polling waste, still waits for receipt |
| 3. No wait | `false` | n/a | Broadcast and respond — should be ~1-2s |
| 4. No wait + low gas estimate | `false` + skip gas check if possible | n/a | Theoretical floor |

If variant 3 is ~2s and variant 1 is ~15s, **the answer is "Tempo's proxy
is using `waitForConfirmation: true` with default polling and it's
extremely conservative for a microtransaction proxy."** That's worth
opening a GitHub issue or DM with the Tempo team.

## Setup checklist

### Prerequisites

- [ ] **Google Maps API key** — free, requires Google Cloud account with
      billing enabled (~$200/mo of free credits, won't be charged for our
      volume). Restrict the key to Static Street View only and to the
      reseller server's IP.
- [ ] **Receiving wallet** — fresh EVM wallet just for reseller revenue.
      Keeps demo spend (your AgentCash wallet) visually separate from
      reseller earnings. ~$0 to create.
- [ ] **Public-facing endpoint** — start with `ngrok` for the dev proof,
      move to Vercel deploy for the persistent version.

### Reseller code (sketch)

`app/api/streetview/route.ts` (in a new project, NOT in talaria):

```ts
import { Mppx, tempo } from 'mppx/server';

const USDC_E_TEMPO = '0x20c000000000000000000000b9537d11c60e8b50';

// Build the mppx server. We'll create THREE variants to test:
const mppxFast = Mppx.create({
  methods: [tempo.charge({
    currency: USDC_E_TEMPO,
    recipient: process.env.RESELLER_WALLET as `0x${string}`,
    waitForConfirmation: false, // ← the experiment
  })],
  secretKey: process.env.MPP_SECRET!,
});

const mppxDefault = Mppx.create({
  methods: [tempo.charge({
    currency: USDC_E_TEMPO,
    recipient: process.env.RESELLER_WALLET as `0x${string}`,
    waitForConfirmation: true, // explicit default for comparison
  })],
  secretKey: process.env.MPP_SECRET!,
});

export async function GET(request: Request) {
  // Pick which variant based on a query param for the experiment
  const url = new URL(request.url);
  const variant = url.searchParams.get('variant') ?? 'fast';
  const mppx = variant === 'default' ? mppxDefault : mppxFast;

  // Charge $0.005 (cheaper than Tempo's $0.007 to undercut for fun)
  const response = await mppx.charge({ amount: '0.005' })(request);
  if (response.status === 402) return response;

  // Authenticated — call upstream Google Maps with our key
  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');
  const upstream = await fetch(
    `https://maps.googleapis.com/maps/api/streetview` +
    `?location=${lat},${lng}` +
    `&size=800x500` +
    `&radius=50` +
    `&source=outdoor` +
    `&key=${process.env.GOOGLE_MAPS_KEY}`
  );

  return response.withReceipt(upstream);
}
```

### Verification plan

1. Deploy reseller (local + ngrok is fine)
2. Time 5 calls against `mppxFast` (waitForConfirmation: false)
3. Time 5 calls against `mppxDefault` (waitForConfirmation: true)
4. Time 5 calls against `googlemaps.mpp.tempo.xyz/maps/streetview` for control
5. Compare medians

Expected outcomes (predictions to validate):

- `mppxFast`: 1-2 seconds. Just network roundtrip + Google upstream.
- `mppxDefault`: 3-6 seconds. One block confirmation + viem polling tax.
- Tempo's proxy: 15 seconds. ← what we measured

If `mppxDefault` is also ~15s, the issue is deeper than just the
`waitForConfirmation` knob — possibly viem's default `pollingInterval`
of 4000ms applied to a chain that produces blocks every 600ms. Test
variant 2 to verify.

## What we'd learn

1. **Definitive answer to "is Tempo's proxy slow or is the blockchain slow"** —
   the experiment isolates these.
2. **Whether `waitForConfirmation: false` is acceptable** — the doc warning
   says receipts will optimistically report success even if the tx reverts
   on-chain. For a $0.005 image fetch this is fine; for high-value calls
   it isn't. Useful nuance.
3. **Whether the polling interval is the issue** — if so, this is a
   one-line PR upstream to mppx (or Tempo's proxy config) that would help
   the entire MPP ecosystem.
4. **How to build a real reseller** — we'd have a working pattern that
   could be reused for any other service we wanted to wrap.

## Costs and risks

- **Spend during the experiment**: ~$0.10. Five test calls × three variants ×
  $0.005-0.007. The receiving wallet earns most of it back (we pay our
  own reseller), so net spend is ~$0.04.
- **Google API key exposure**: keep it server-side, restrict by IP if
  possible. Don't commit to git.
- **Wallet exposure**: use a fresh wallet that holds nothing except the
  small reseller revenue. Sweep periodically to a cold wallet.
- **Google TOS for reselling Street View**: gray area for production but
  fine for dev. Read their terms before going public.
- **Spam protection**: a public reseller without rate limiting would let
  anyone hammer your Google API key. mppx makes every call cost the
  caller money so it's self-limiting, but you'd still want to cap per
  source.

## Strategic value beyond the perf question

- **Shows both sides of the MPP coin** — Talaria has been "agent that
  pays for APIs." A reseller is "service that gets paid by agents." Both
  sides of the MPP ecosystem in one project.
- **A revenue mechanic to talk about** — "I run a Google Maps reseller
  and earn $0.003 per call, the spread between my $0.005 charge and
  Google's free tier."
- **Reference implementation** other people could borrow if they want to
  build their own reseller.

## Estimated time

~2 hours of focused work for a complete experiment with results written up.
Not for a demo night. Reserve for a learning session.
