# MPP Latency Round 1 — Findings

> **Date:** 2026-04-08
> **Spend:** $0.1729 of a $1.00 hard cap
> **Harness:** [scripts/mpp-latency/](../scripts/mpp-latency/)

## Background

A Google Maps integration via MPP was timing out at **15-35 seconds per call** — unusable for any user-facing flow. We didn't know whether the slowness was Google-Maps-specific, MPP-on-Tempo-wide, or specific to one proxy operator. Round 1 cast a wide net across several MPP services, recorded total response time per call, and asked: **where does the slowness actually live?**

A follow-up controlled experiment (the "Tempo controlled comparison" — same Alchemy upstream tested via two different proxy operators) was added after the initial sweep produced an unclear answer about which variable mattered. That experiment is what nailed the conclusion.

Round 2 (build our own Google Maps reseller with deep instrumentation) remains a separate, follow-up workstream. Round 1 answered the diagnostic question; Round 2 will own the proxy code so we can both measure deeply and beat the number.

## Method

A small standalone test harness under [scripts/mpp-latency/](../scripts/mpp-latency/) wraps the `agentcash` CLI (the same call path production code uses) and records **total round-trip time per paid call**. No deep instrumentation — that's a Round 2 concern. Just one number per call: how long did it take, end to end.

### Services tested

| Service | Proxy class | Host | Endpoint | Per call | Samples |
|---|---|---|---|---:|---:|
| OpenWeather | locus | `openweather.mpp.paywithlocus.com` | `/openweather/current-weather` | $0.006 | 3 |
| Abstract Timezone | locus | `abstract-timezone.mpp.paywithlocus.com` | `/abstract-timezone/current-time` | $0.006 | 3 |
| Mapbox Geocode | locus | `mapbox.mpp.paywithlocus.com` | `/mapbox/geocode-forward` | $0.0037 | 3 |
| RentCast Markets | locus | `rentcast.mpp.paywithlocus.com` | `/rentcast/markets` | $0.033 | 2 |
| Alchemy RPC (direct) | direct | `mpp.alchemy.com` | `/eth-mainnet/v2` | $0.001 | 11 (incl. smoke) |
| Alchemy RPC (Tempo proxy) | **tempo** | `alchemy.mpp.tempo.xyz` | `/eth-mainnet/v2` | $0.0001 | 10 |
| Google Maps Streetview | **tempo** | `googlemaps.mpp.tempo.xyz` | `/maps/streetview` | $0.007 | 3 |
| agentres availability | x402-base | `www.agentres.dev` | `/api/availability` | (intended free) | 10 |
| agentres search | x402-base | `www.agentres.dev` | `/api/search` | (intended free) | 10 |

The two Alchemy entries are the controlled experiment: same upstream API, same chain, same payment flow, **only the proxy operator differs.**

Four proxy classes:
- **locus** — Locus-operated proxies at `*.mpp.paywithlocus.com`
- **tempo** — Tempo-hosted proxies at `*.mpp.tempo.xyz`
- **direct** — services hosting their own MPP receiver (Alchemy)
- **x402-base** — x402 protocol on Base, not MPP-on-Tempo (agentres)

### Safety guardrails

- Two-layer budget cap, fail-closed: $1.00 global + per-service sub-caps, checked **before** every call, persisted across runs.
- Preflight: every endpoint probed via the free 402 challenge first to verify `intent="charge"` (never `session`) and that the live cost matched the catalog within 1.5×. Drift aborted the sweep.
- 60s per-call timeout (vs production's 15s) so we'd actually capture the 15-35s outliers we were trying to measure.
- Test traffic isolated from production: harness writes nothing to `mpp_transactions` or `mpp_cache`.

### Catalog drifts caught at preflight (no money spent)

- **Alchemy** is documented at $0.0001/call in [docs/mpp-endpoints.md](mpp-endpoints.md). **Live price is $0.001** — 10× higher.
- **Google Places Text Search** was estimated at $0.008/call. **Live price is $0.032** — 4× higher (matches Google's wholesale Places price).
- **agentres** `/api/availability` and `/api/search` are listed as FREE in the agentres docs. **Live they require x402 payment** — every probe returned HTTP 402. Recorded as errors; no money spent.

## Headline finding

**Tempo's proxy class is structurally ~5× slower than Locus or direct.** The Google Maps slowness from yesterday is not Google-Maps-specific — it's a property of routing through Tempo's proxy infrastructure.

| Class | Service | Median (ms) | Mean (ms) | Max (ms) |
|---|---|---:|---:|---:|
| direct | alchemy-rpc | 4427 | 5180 | 11817 |
| locus | mapbox-geocode | 4428 | 4407 | 4698 |
| locus | openweather-current | 4508 | 4499 | 4557 |
| locus | rentcast-markets | 4495 | 4471 | 4495 |
| locus | timezone-current | 4371 | 4469 | 4683 |
| **tempo** | **alchemy-tempo** | **19,838** | **19,748** | **20,941** |
| **tempo** | **gmaps-streetview** | **21,636** | **21,744** | **24,555** |

### The killer comparison

The two Alchemy entries are the smoking gun. **Same upstream API, same chain, same payment flow, only the proxy operator differs:**

| Endpoint | Proxy operator | Median |
|---|---|---:|
| `mpp.alchemy.com/eth-mainnet/v2` | Alchemy direct | **4,427 ms** |
| `alchemy.mpp.tempo.xyz/eth-mainnet/v2` | Tempo-hosted | **19,838 ms** |

**~4.5× slower for the same upstream call**, simply by switching which proxy operator wraps it. This isolates the cause completely. It is not the upstream API, it is not the response payload type (Alchemy returns tiny JSON, not binary images like Streetview), it is not the chain — it is the proxy infrastructure itself.

Both Tempo-hosted services we tested cluster at the same ~20s number:
- Google Maps Streetview: 19,042–24,555 ms (n=3)
- Alchemy via Tempo proxy: 18,212–20,941 ms (n=8)

Five non-Tempo services across two different infrastructure classes (Locus and direct) all settle within ~150ms of each other at ~4.5 seconds. The pattern is so tight (±5%) on the non-Tempo side and so consistently slow (~5× the non-Tempo floor) on the Tempo side that the conclusion is unambiguous.

## What this tells us

### 1. The proxy operator IS the bottleneck

This is the inverted finding from the initial sweep, where we only had one Tempo data point (Google Maps) and couldn't separate "Tempo's infrastructure is slow" from "Google Maps specifically is slow." The Tempo controlled comparison settles it: routing the *exact same* Alchemy `eth_blockNumber` call through Tempo's proxy adds ~15.4 seconds compared to going through Alchemy's direct receiver. There is no upstream variable, no payload variable, no chain variable to blame — only the proxy operator changed.

Locus and direct/Alchemy both produce ~4.5s medians. Tempo produces ~20s medians. Two Tempo services tested, both consistent. The slowness is structural to whatever Tempo's proxy stack is doing on top of the standard MPP-on-Tempo flow.

We cannot decompose the extra ~15s further from outside the CLI — that's a Round 2 problem. Plausible candidates include serverless cold-starts, more aggressive on-chain confirmation policies, synchronous (rather than overlapped) verification + upstream phases, or geographic routing penalties. Whatever it is, it's per-Tempo-proxy-call and reproducible.

### 2. The ~4.5s floor decomposes (roughly) like this

- ~1s of `agentcash` CLI startup once filesystem cache is warm (measured directly via `agentcash --version`)
- ~3.5s of actual MPP work (initial 402 round trip + on-chain payment + retry round trip)

We can't break the 3.5s further from outside the CLI — it's a black box. Round 2's reseller will instrument it from the inside. The most likely dominant phase, given Tempo's 500ms block times and ~2-block typical confirmation, is **on-chain payment confirmation + the proxy-side verification step before the upstream call**. Both happen for every MPP service regardless of proxy operator.

### 3. Cost-per-call does NOT predict latency

Four price points tested ($0.001, $0.0037, $0.006, $0.033) — all the same speed. RentCast is 33× the price of Alchemy and finishes in 4495ms vs 4427ms. Whatever you're paying for, it isn't speed.

### 4. First-call cold filesystem cache is real and significant

The very first spawn of the `agentcash` CLI from a fresh process took **18.5 seconds**. Subsequent spawns within the same parent process took **~1 second**. The first paid alchemy call (smoke test) took **11.8s**; every later alchemy call ran 4.2-5.0s.

**What this means in plain terms:** when you start a Node program (Next.js dev server, a script, anything) and it makes its very first MPP call, the operating system has to read the agentcash JavaScript files from disk for the first time. Disk reads are slow. Once those files are read, the OS keeps a copy in RAM (the "filesystem cache") and every subsequent read of the same file comes from RAM, which is much faster. The first call pays the disk-read cost, every later call benefits from the cached version.

**Practical implication:** if a production code path makes a single MPP call shortly after process startup and then never makes another, it pays the full cold-cache penalty. If it makes many calls in a session, only the very first is slow. A long-running web server stays warm. A short-lived script doesn't.

### 5. Latency is consistent within each service

Once warm, every service produced tight distributions:
- OpenWeather: 4433-4557ms (±2.7%)
- Timezone: 4353-4683ms (±3.7%)
- Mapbox: 4096-4698ms (±7.3%)
- Alchemy direct: 4215-4995ms (±9% across 10 samples)
- RentCast: 4446-4495ms (±0.5%, only 2 samples)
- **Alchemy via Tempo: 18,212-20,941ms (±7% across 8 successful samples)**
- **Google Maps: 19,042-24,555ms (±13%)**

Both Tempo-class services are reliably slow, not jittery slow. The Tempo proxies are *consistently* delivering ~20s — they have a structural floor like the other classes, just at a much higher number. This further supports "structural to the proxy stack" rather than "intermittent network bad luck."

## Caveats

- **The CLI is a black box.** The harness only measures end-to-end round-trip per call. We can't decompose into DNS, TCP, TLS, payment broadcast, chain confirmation, or proxy verification individually — those phases are all inside the `agentcash` process. Round 2's reseller will fix this by owning the proxy code.
- **agentcash CLI has an internal 30s timeout.** Discovered during the alchemy-tempo sweep — call 9 errored at 33.5s with `"Request timed out after 30000ms"`. The harness's outer 60s timeout is moot; agentcash is the binding constraint. **Production code that uses agentcash CLI against Tempo-hosted services is at risk of intermittent timeouts**, since Tempo calls regularly take 18-21s and leave only ~9s of headroom before hitting agentcash's cap. Worth either bumping agentcash's timeout via its `--timeout` flag (if supported) or avoiding Tempo-hosted proxies for any user-facing path.
- **Two Tempo data points isn't infinite.** The conclusion "Tempo's proxy class is structurally slow" rests on Google Maps (n=3) and Alchemy via Tempo (n=8) — 11 samples total across two services. The gap (~20s vs ~4.5s for non-Tempo) is large enough that this is overwhelming evidence, but a third Tempo service would let us claim it as a property of the entire class with full confidence rather than two specific proxies that happen to behave the same way.
- **One measurement run, not multiple times of day.** Results could differ if Tempo chain conditions or proxy load vary by time. A second run tomorrow at a different time would cost ~$0.17 and give us a confidence check.
- **Sample sizes are small** (2-11 per service). Sufficient for "the median is ~4.5s vs ~20s" — these signals are clean and the gap is too big to be noise. Not sufficient for tail-percentile claims (p95/p99).
- **Single environment.** All tests ran from one machine (Windows 11, Central Time). Different network conditions, different geographic regions, different operating systems would all be useful follow-up data points.
- **Google Maps streetview only.** The original failing case yesterday also involved a chained `textsearch` → `places/.../photos/.../media` flow. We dropped the chain because (a) consistent times yesterday on textsearch made re-testing low-value, and (b) the chained call would have added $0.16+ in spend. Streetview is enough to confirm `googlemaps.mpp.tempo.xyz` is structurally slow, and the Alchemy controlled comparison generalizes the finding to the entire Tempo proxy class.

## Round 2 framing

Round 1 answered the diagnostic question. Round 2 — building our own Google Maps reseller — has even clearer motivation now: **the goal is to escape Tempo's proxy class entirely**, not just to provide a comparison data point.

> **Target: ~4.5 seconds median total** on the Google Maps streetview path (or any other Tempo-hosted upstream we want to wrap). That's the floor that healthy Locus and direct proxies hit. Anything noticeably above ~4.5s in our own reseller would mean we're inheriting the same problem the Tempo proxies have, and we'd need to instrument deeper to find why.

A reseller that lands at ~4.5s would also be cheaper per call than `googlemaps.mpp.tempo.xyz` (we'd set our own price) and would let us add user-facing features like response caching at the reseller layer.

### Practical immediate consequences (before Round 2 ships)

- **Avoid Tempo-hosted proxies for any user-facing flow.** A 20-second user wait is unacceptable. Use Locus-hosted, direct, or cached results instead.
- **agentcash's 30s internal timeout will bite.** ~10% of Tempo-class calls will simply error rather than be slow. If we ever do use a Tempo proxy, wrap calls with retry logic and warn the user about the wait.
- **The healthy floor is ~3.5s of MPP work + ~1s of warm CLI startup.** Even Locus/direct calls aren't fast enough to feel instant. Anything user-facing should cache aggressively or run in the background with a loading indicator.

### Deep instrumentation (still Round 2)

The deep instrumentation (undici diagnostic channels for DNS/TCP/TLS, ethers RPC-level debug for chain interactions, chain-watch background poll for Tempo health, cold-vs-warm forced socket cycling, direct-HTTPS controls to the upstream origin) all belong inside Round 2's reseller code, where we own both ends of the call. That's why Round 1 was deliberately rudimentary.

The Round 1 harness is reusable for the Round 2 reseller comparison: just add the new reseller to [scripts/mpp-latency/services.ts](../scripts/mpp-latency/services.ts) as a new entry and run the same sweep against it.

## Reproduction

From the repo root:

```bash
# 1. Verify all endpoints (free — reads 402 challenges, no payment)
npx tsx scripts/mpp-latency/preflight-all.ts

# 2. Run sweeps individually (paid — uses agentcash wallet)
npx tsx scripts/mpp-latency/sweeps/openweather.ts
npx tsx scripts/mpp-latency/sweeps/timezone.ts
npx tsx scripts/mpp-latency/sweeps/mapbox.ts
npx tsx scripts/mpp-latency/sweeps/alchemy.ts
npx tsx scripts/mpp-latency/sweeps/alchemy-tempo.ts
npx tsx scripts/mpp-latency/sweeps/rentcast.ts
npx tsx scripts/mpp-latency/sweeps/googlemaps.ts

# 3. Generate the report
npx tsx scripts/mpp-latency/analyze.ts
```

Per-call NDJSON logs land in `scripts/mpp-latency/logs/` (gitignored).
Markdown reports land in `scripts/mpp-latency/reports/` (gitignored).

The `preflight-all.ts` step costs nothing and is the recommended sanity check before any paid run — it catches catalog drift, session-intent gotchas, and broken endpoints without spending a cent.

## Per-service raw stats

| Service | Class | Cost/call | Samples | Min (ms) | Median (ms) | Max (ms) | Mean (ms) |
|---|---|---:|---:|---:|---:|---:|---:|
| openweather-current | locus | $0.006 | 3 | 4433 | 4508 | 4557 | 4499 |
| timezone-current | locus | $0.006 | 3 | 4353 | 4371 | 4683 | 4469 |
| mapbox-geocode | locus | $0.0037 | 3 | 4096 | 4428 | 4698 | 4407 |
| rentcast-markets | locus | $0.033 | 2 | 4446 | 4495 | 4495 | 4471 |
| alchemy-rpc (direct) | direct | $0.001 | 11 | 4215 | 4427 | 11817 | 5180 |
| **alchemy-tempo** | **tempo** | **$0.0001** | **8** | **18,212** | **19,838** | **20,941** | **19,748** |
| **gmaps-streetview** | **tempo** | **$0.007** | **3** | **19,042** | **21,636** | **24,555** | **21,744** |

Notes:
- Alchemy direct mean is inflated by the smoke-test sample which paid full cold-cache cost; warm-only mean across the remaining 10 calls is 4516ms.
- Alchemy via Tempo had 10 attempted samples; 8 succeeded, 1 hit agentcash's internal 30s timeout (~33.5s total elapsed before agentcash gave up), and 1 produced a network error coincident with a real internet drop on the test machine.
- The two Alchemy entries are the same upstream API. The price difference ($0.001 direct vs $0.0001 Tempo-hosted) is set independently by each proxy operator.
