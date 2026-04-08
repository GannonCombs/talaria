# MPP Latency Round 1 — Findings

> **Date:** 2026-04-08
> **Spend:** $0.1721 of a $1.00 hard cap
> **Harness:** [scripts/mpp-latency/](../scripts/mpp-latency/)

## Background

A Google Maps integration via MPP was timing out at **15-35 seconds per call** — unusable for any user-facing flow. We didn't know whether the slowness was Google-Maps-specific, MPP-on-Tempo-wide, or specific to one proxy operator. Round 1 cast a wide net across several MPP services, recorded total response time per call, and asked: **where does the slowness actually live?**

Round 2 (build our own Google Maps reseller with deep instrumentation) is a separate, follow-up workstream. Round 1 needed to answer the diagnostic question first so Round 2 has a defensible target to beat.

## Method

A small standalone test harness under [scripts/mpp-latency/](../scripts/mpp-latency/) wraps the `agentcash` CLI (the same call path production code uses) and records **total round-trip time per paid call**. No deep instrumentation — that's a Round 2 concern. Just one number per call: how long did it take, end to end.

### Services tested

| Service | Proxy class | Endpoint | Per call | Samples |
|---|---|---|---:|---:|
| OpenWeather | locus | `/openweather/current-weather` | $0.006 | 3 |
| Abstract Timezone | locus | `/abstract-timezone/current-time` | $0.006 | 3 |
| Mapbox Geocode | locus | `/mapbox/geocode-forward` | $0.0037 | 3 |
| RentCast Markets | locus | `/rentcast/markets` | $0.033 | 2 |
| Alchemy RPC | direct | `/eth-mainnet/v2` | $0.001 | 11 (incl. smoke) |
| Google Maps Streetview | tempo | `/maps/streetview` | $0.007 | 3 |
| agentres availability | x402-base | `/api/availability` | (intended free) | 10 |
| agentres search | x402-base | `/api/search` | (intended free) | 10 |

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

**Google Maps is the outlier, not MPP.**

| Class | Service | Median (ms) | Mean (ms) | Max (ms) |
|---|---|---:|---:|---:|
| direct | alchemy-rpc | 4427 | 5180 | 11817 |
| locus | mapbox-geocode | 4428 | 4407 | 4698 |
| locus | openweather-current | 4508 | 4499 | 4557 |
| locus | rentcast-markets | 4495 | 4471 | 4495 |
| locus | timezone-current | 4371 | 4469 | 4683 |
| **tempo** | **gmaps-streetview** | **21636** | **21744** | **24555** |

**Five completely independent services across two infrastructure classes (Locus and direct/Alchemy) all settle within ~150ms of each other at ~4.5 seconds.** The pattern is so tight (±5%) that any MPP-on-Tempo call has a structural ~4.5s floor for healthy proxies.

**Google Maps is ~5× the floor**, and the slowness is reproducible: 3 of 3 samples in the 19-25 second range, exactly matching yesterday's 15-35s observation. This is not jitter, it's not a bad moment — it's structural to the `googlemaps.mpp.tempo.xyz` proxy specifically.

## What this tells us

### 1. The proxy class is mostly a red herring

RentCast (Locus, $0.033/call), OpenWeather (Locus, $0.006), and Alchemy (direct/no third-party proxy, $0.001) all settle at the same ~4.5s. The choice of "is this behind Locus or not" doesn't predict latency. Whatever the ~4.5s floor is, it lives downstream of the proxy operator.

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
- Alchemy: 4215-4995ms (±9% across 10 samples)
- RentCast: 4446-4495ms (±0.5%, only 2 samples)
- Google Maps: 19042-24555ms (±13%)

Even Google Maps, the slow one, is internally consistent — it's reliably slow, not jittery slow. That further supports "structural to the proxy" rather than "occasional bad luck."

## Caveats

- **The CLI is a black box.** The harness only measures end-to-end round-trip per call. We can't decompose into DNS, TCP, TLS, payment broadcast, chain confirmation, or proxy verification individually — those phases are all inside the `agentcash` process. Round 2's reseller will fix this by owning the proxy code.
- **One measurement run, not multiple times of day.** Results could differ if Tempo chain conditions or proxy load vary by time. A second run tomorrow at a different time would cost ~$0.17 and give us a confidence check.
- **Sample sizes are small** (2-11 per service). Sufficient for "the median is ~4.5s vs ~21.6s" — these signals are clean and the gap is too big to be noise. Not sufficient for tail-percentile claims (p95/p99). We don't have enough data to say anything about how often a Google Maps call goes to 35s vs 19s.
- **Single environment.** All tests ran from one machine (Windows 11, Central Time). Different network conditions, different geographic regions, different operating systems would all be useful follow-up data points.
- **Google Maps streetview only.** The original failing case yesterday also involved a chained `textsearch` → `places/.../photos/.../media` flow. We dropped the chain from Round 1 because (a) you observed consistent times yesterday on textsearch, so re-testing was low-value, and (b) the chained call would have added $0.16+ in spend. Streetview alone is enough to confirm `googlemaps.mpp.tempo.xyz` is structurally slow.

## Round 2 framing

Round 1 answered the diagnostic question. Round 2 — building our own Google Maps reseller and instrumenting it deeply — now has a concrete target:

> **Beat 21.6 seconds median total on the Google Maps streetview path.** The other ~4.5s services tell us the MPP-on-Tempo floor; anything Round 2 spends above ~4.5s is the proxy-specific cost we're trying to attribute.

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
npx tsx scripts/mpp-latency/sweeps/rentcast.ts
npx tsx scripts/mpp-latency/sweeps/googlemaps.ts

# 3. Generate the report
npx tsx scripts/mpp-latency/analyze.ts
```

Per-call NDJSON logs land in `scripts/mpp-latency/logs/` (gitignored).
Markdown reports land in `scripts/mpp-latency/reports/` (gitignored).

The `preflight-all.ts` step costs nothing and is the recommended sanity check before any paid run — it catches catalog drift, session-intent gotchas, and broken endpoints without spending a cent.

## Per-service raw stats

Same data as the headline table, with one additional row for completeness:

| Service | Class | Cost/call | Samples | Min (ms) | Median (ms) | Max (ms) | Mean (ms) |
|---|---|---:|---:|---:|---:|---:|---:|
| openweather-current | locus | $0.006 | 3 | 4433 | 4508 | 4557 | 4499 |
| timezone-current | locus | $0.006 | 3 | 4353 | 4371 | 4683 | 4469 |
| mapbox-geocode | locus | $0.0037 | 3 | 4096 | 4428 | 4698 | 4407 |
| rentcast-markets | locus | $0.033 | 2 | 4446 | 4495 | 4495 | 4471 |
| alchemy-rpc | direct | $0.001 | 11 | 4215 | 4427 | 11817 | 5180 |
| gmaps-streetview | tempo | $0.007 | 3 | 19042 | 21636 | 24555 | 21744 |

(Alchemy mean is inflated by the smoke-test sample which paid full cold-cache cost; warm-only mean across the remaining 10 calls is 4516ms.)
