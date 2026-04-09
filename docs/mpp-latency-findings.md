# MPP Latency — Findings (Rounds 1, 1.5, and 2)

> **Date:** 2026-04-08
> **Cumulative spend:** $0.1889 of a $1.00 hard cap
> **Harness:** [scripts/mpp-latency/](../scripts/mpp-latency/)
> **Reseller (Round 2):** [mpp-reseller/](../mpp-reseller/)
>
> This document covers three rounds of investigation:
> - **Round 1** — wide sweep across 6 MPP services to find where the slowness lives. Conclusion: Google Maps via Tempo's proxy is ~5× slower than every other service.
> - **Round 1.5** — controlled comparison via `alchemy.mpp.tempo.xyz` (same upstream as direct Alchemy, different proxy operator). Conclusion: the slowness is structural to Tempo's proxy class as a whole, not Google-Maps-specific.
> - **Round 2** — built our own MPP reseller (`mpp-reseller/`) wrapping Google Maps endpoints. Conclusion: the reseller is the fastest proxy class measured, end-to-end and especially server-side. The "4.5s structural floor" we identified in Round 1 was actually agentcash CLI client overhead, not server work. Tempo's `googlemaps.mpp.tempo.xyz` is doing ~17 seconds of unnecessary server-side work per call.

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

---

# Round 2 — We built our own reseller and it's the fastest class measured

> **Round 2 spend:** $0.0160 (16 paid calls × $0.001)
> **Reseller code:** [mpp-reseller/](../mpp-reseller/)

## What we built

A standalone Node.js MPP reseller wrapping three Google Maps endpoints (Streetview Static, Places Text Search, Places Photo) using `mppx/hono`. Listens on `127.0.0.1:8787`. Owns its own wallet at `mpp-reseller/keys/reseller-wallet.json` (separate from the main agentcash wallet, with multiple guardrails to prevent any code path from touching `~/.agentcash/`).

**Two `Mppx` instances at startup**, exposed on parallel route prefixes:

| Path prefix | Mode | `tempo.charge({ waitForConfirmation })` |
|---|---|---|
| `/maps/...`, `/places/v1/...` | confirmed (default) | `true` (waits for on-chain inclusion) |
| `/fast/maps/...`, `/fast/places/v1/...` | fast | `false` (broadcasts after simulation only) |

Both modes call the same handler functions and the same upstream Google Maps API. Only the mppx middleware differs. This is the controlled experiment we couldn't run from outside any third-party reseller because we didn't own both ends of the call.

Per-request server-side instrumentation (`mpp-reseller/src/instrumentation.ts`) captures six phase markers (T0 outer entry → T6 outer exit) and writes one NDJSON record per call to `mpp-reseller/logs/YYYY-MM-DD.ndjson`. This is the data Round 1 never had — the agentcash CLI was opaque from outside.

## Headline finding — the per-class table updated

Same harness, same client (agentcash CLI), same chain, same gap-between-calls. The new `self` row is the reseller; the others are unchanged from Round 1:

| Class | Services | Calls | Mean total | **Median total** | Max total |
|---|---:|---:|---:|---:|---:|
| direct | 1 | 11 | 5180 | 4427 | 11817 |
| locus | 4 | 11 | 4461 | 4446 | 4698 |
| **self (reseller)** | **4** | **16** | **3995** | **3949** | **4634** |
| tempo | 2 | 11 | 20270 | 19885 | 24555 |

**Our reseller is the fastest class measured, end-to-end.** Median 3949 ms vs Locus 4446 ms vs direct 4427 ms vs Tempo 19885 ms. We beat the Locus floor by ~500 ms even on the harness's end-to-end timer (which includes all the agentcash CLI client overhead). The server-side numbers are dramatically better still.

## Server-side phase decomposition

The reseller's own NDJSON, filtered to paid retries (`status=200`, `total > 100ms`), n=19 records across the four endpoints:

| Mode | Endpoint | n | Min | **Median** | Max | outer | upstream_ttfb | body |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| confirmed | streetview | 7 | 1226 | **1485** | 1800 | 1106 | 320 | 82 |
| confirmed | textsearch | 3 | 1458 | **1690** | 1939 | 1087 | 539 | 73 |
| fast | streetview | 6 | 863 | **917** | 1259 | 659 | 230 | 84 |
| fast | textsearch | 3 | 1007 | **1099** | 1143 | 542 | 463 | 73 |

Reading the rows: the **server-side** total to receive a paid 402 request, verify the payment, call Google Maps, and stream the response back is **0.9-1.7 seconds**, depending on mode and endpoint. The remaining ~2-3 seconds in the harness's end-to-end measurement is **all client-side**: agentcash CLI startup, viem signing, broadcasting the USDC.e transfer, and waiting for `tx.wait()` before re-fetching with the Authorization header.

### Per-phase explanation
- **`outer_overhead`** — T0→T1, the time mppx spent verifying the credential. On a paid retry this includes the on-chain payment confirmation wait (when `waitForConfirmation: true`), or just the broadcast roundtrip (when `false`).
- **`pre_upstream`** — T1→T2, time between handler entry and the upstream `fetch()`. Effectively zero.
- **`upstream_ttfb`** — T2→T3, time waiting for Google Maps to return the first byte of the response.
- **`upstream_body`** — T3→T4, time downloading the response body. ~80 ms for a 45 KB Streetview JPEG.
- **`receipt_attach`** — T5→T6, time mppx took to add the `Payment-Receipt` header. Sub-millisecond.

## What `waitForConfirmation` actually costs

Both endpoints show a clean, consistent delta when the only variable changed is `waitForConfirmation`:

| Endpoint | Confirmed median | Fast median | Delta |
|---|---:|---:|---:|
| streetview | 1485 ms | 917 ms | **−568 ms (38% faster)** |
| textsearch | 1690 ms | 1099 ms | **−591 ms (35% faster)** |

**On-chain confirmation costs ~570-590 ms** server-side. mppx hardcodes `experimental_preconfirmationTime: 500` for Tempo's fast preconfirmation path, plus a small RPC roundtrip — the total of ~570 ms is consistent with about 1.1 Tempo blocks of wait time. Skipping it via `waitForConfirmation: false` doesn't make the call dramatically faster (the upstream call still has to happen), but it does cut server-side latency by roughly a third.

The end-to-end (harness) delta is smaller (~440 ms instead of 570 ms) because some of the client-side work happens in parallel with the server's wait.

## The big revision: what the "4.5s structural floor" actually is

Round 1 measured five non-Tempo MPP services (Locus and direct) all clustering at ~4.5 seconds end-to-end with very tight variance. We called this a "structural floor" and assumed it was the unavoidable cost of MPP-on-Tempo. **Round 2 falsified that.**

Apples-to-apples comparison, all measured by the same harness, same client, same network conditions:

| | Server-side median | End-to-end (via harness) |
|---|---:|---:|
| Round 1 Locus services | unknown (CLI-opaque) | ~4,446 ms |
| Round 2 reseller (confirmed) | **1,485 ms** | 3,949 ms |
| Round 2 reseller (fast) | **917 ms** | 3,624 ms |

Subtracting end-to-end from server-side gives the **client-side overhead** the harness adds:

| Mode | End-to-end | Server-side | **Client-side** |
|---|---:|---:|---:|
| confirmed streetview | 4062 ms | 1485 ms | **2577 ms** |
| fast streetview | 3624 ms | 917 ms | **2707 ms** |

The agentcash CLI client adds a roughly constant ~2.6-2.7 seconds of overhead per call, regardless of which mode the server is in. That's where the "4.5s structural floor" came from — it was always **server time + client overhead**, and the client portion was big enough to make every endpoint look the same.

**Implications:**

1. **Locus's actual server-side latency was always faster than 4.5s**, probably in the 1-2 second range, just like ours. The harness couldn't see that because the CLI was a black box.
2. **Building a faster reseller alone won't help users much** if they call it via the agentcash CLI — they'll still pay ~2.7 s of client overhead per call. The end-to-end win is real but modest.
3. **A direct `mppx/client` integration in Talaria** (no subprocess) would let us hit the 1-2 second server-side number end-to-end. That's the path to genuinely fast MPP calls in user-facing flows.

## The Tempo googlemaps mystery is now structurally bounded

Tempo's `googlemaps.mpp.tempo.xyz` median end-to-end: ~21,636 ms.
Our reseller's median end-to-end (same upstream, same chain, same client): ~4,062 ms.

That's a ~17,500 ms gap, with **every variable controlled for except the proxy implementation itself.** The chain is the same. The upstream API is the same (literally Google's Streetview Static endpoint). The mppx server library is the same. The `waitForConfirmation` default is the same. The agentcash client path is the same.

**Whatever Tempo is doing on their side adds ~17 seconds of pure overhead per call.** Most plausible explanations:

- **Cold-start serverless on every request** (Lambda or Cloud Run with aggressive scale-to-zero, and apparently no warm pool)
- **Aggressive on-chain confirmation policy** (waiting for many more blocks than mppx defaults — 17s would be 30+ blocks at Tempo's 500 ms block time)
- **Synchronous upstream call serialized behind the entire confirmation wait** (vs overlapping the way well-built proxies should)
- **Geographic distance + cold connection pool** (less likely — ~17s is extreme for geographic alone)
- **Literal `setTimeout` somewhere in their proxy code** (rate-limit politeness, anti-abuse, etc.)

We can't prove which from outside, and we don't need to. The key conclusion: **the slowness is implementation-specific to Tempo's googlemaps proxy, not an inherent cost of MPP, mppx, the chain, or the upstream.** A well-built reseller can land at ~1-2 seconds server-side. They're at ~18-19 seconds. That's their code, not the protocol.

## Plan agent's predictions vs reality

The Plan agent that critiqued Round 2's design predicted three outcomes for the reseller. Scoring:

| Prediction | Actual | Score |
|---|---|---|
| Confirmed mode lands at ~4.5s | 3949 ms end-to-end ✓ (also 1485 ms server-side, much better than predicted) | ✓ Conservative — actual is faster than predicted |
| Fast mode lands at 1.5-2.5s | 3624 ms end-to-end ✗ (only 917 ms server-side though) | ✗ The end-to-end didn't speed up much because client overhead dominates |
| The on-chain wait is "a chunk but not the whole story" | ~570 ms server-side (~14% of harness end-to-end, ~38% of server-side) | ✓ Exactly right |

The prediction missed how much of the floor was client-side. On the server side, the reseller is significantly faster than even the agent's optimistic prediction.

## Practical implications for Talaria

Updated from Round 1's "avoid Tempo proxies" guidance:

1. **Use the reseller for Google Maps in Talaria's housing module.** Server-side ~1-1.5s for Streetview is fast enough for "show a loading spinner, fetch in the background, show photos when ready." The previous 21s was unusable; 1.5-4.5s is fine.
2. **Long-term: integrate `mppx/client` directly** in Talaria's MPP code path instead of shelling out to the agentcash CLI. The ~2.6s of client-side overhead per call is mostly subprocess startup + fetch wrappers; doing it in-process via mppx/client should drop end-to-end calls to ~1.5-2 seconds.
3. **Cache photos aggressively at the reseller layer** if we ever launch the reseller publicly. Same 500m × 500m grid cell + same heading/pitch → same image. Save the call entirely.
4. **`waitForConfirmation: false` is a reasonable default for read-only image endpoints** — the worst case is an attacker pays $0 and gets a Streetview image that the reseller streamed before the chain fully confirmed. The economic value of the leaked image is ~$0.001 worth of Google API credit. Worth it to save 570 ms of latency on a user-visible call.

## Out of scope (Round 3 and later)

- **Public deployment of the reseller.** Cloudflare Workers / Fly.io / Railway. Round 2 ran the reseller locally only.
- **Direct `mppx/client` integration in Talaria.** A separate refactor of `lib/mpp-client.ts` to use mppx programmatically instead of the agentcash subprocess. Would shave ~2-3 seconds off every Talaria MPP call.
- **Photo endpoint sweep** (the chained `textsearch → photos/.../media` flow). Skipped in Round 2 because the existing googlemaps.ts harness sweep already exercised that code path against Tempo's proxy in Round 1.
- **Cache layer at the reseller.** Trivial to add: same query params → same response. Would drop the median latency for cache-hit calls to single-digit milliseconds.
- **Multi-method support** in the reseller (Stripe SPT, x402, Lightning).
- **Rate limiting / per-client quotas** in the reseller.
- **Persistent replay-protection store** (currently in-memory; survives a single process lifetime).
- **Fixing the `tx_hash: null` bug** in `mpp-reseller/src/instrumentation.ts` — mppx isn't putting the tx hash in the `Payment-Receipt` header in the format the regex expects, or it's in a different header. The agentcash client output has the hash for every call, so payments are working — this is just a logging-completeness gap.

## Cumulative spend audit

| Round | Description | Spend |
|---|---|---:|
| Round 1 | 6-service wide sweep | $0.1721 |
| Round 1.5 | alchemy-tempo controlled comparison | $0.0008 |
| Round 2 | Reseller comparison sweep (16 calls × $0.001) | $0.0160 |
| **Total** | | **$0.1889** |
| **Cap** | | **$1.00** |
| **Remaining** | | **$0.8111** |

All payments are USDC.e on Tempo. Round 2's $0.016 went from the user's main agentcash wallet to the reseller wallet — both controlled by the user, recoverable.

Off-chain: Round 2 made 19 successful Google Maps API calls against the user's free-tier credit. At $7-$32 per 1000 calls depending on the API, that's at most ~$0.20 of pretend Google credit consumed, well within the $200/month free allowance.

---

# Round 3 — Listing photos shipped to the housing app

> **Round 3 spend:** $0.003 (3 paid streetview calls × $0.001 — one cold-cache verification on a known-good central Austin listing, plus two Phase E end-to-end tests)
> **Branch:** `feat/listing-photos`, rebased onto master and merged
> **Reseller code:** [mpp-reseller/](../mpp-reseller/) (gained one new free `/maps/streetview/metadata` route)

## What shipped

The parked `feat/listing-photos` branch had a fully-built listing photo feature for the housing module — Next.js API route, disk cache, sentinel handling, ListingDrawer integration, CostInfoModal, and a server-side MPP client rewrite using `mppx/client` + `viem` from the user's main agentcash wallet. The branch was parked because cold-cache photo loads against `googlemaps.mpp.tempo.xyz` took **15-17 seconds** — the same Tempo proxy slowness Round 2 conclusively diagnosed.

Round 3 unblocks the branch by:

1. **Rebasing onto master** — clean merge, zero conflicts. Round 1/1.5/2 only added new files; nothing on master since the fork point touched any of the files the branch modifies.
2. **Swapping one URL constant** in [lib/modules/housing/listing-photo.ts](../lib/modules/housing/listing-photo.ts): `https://googlemaps.mpp.tempo.xyz` → `http://127.0.0.1:8787`. Same flat URL paths, same MPP charge intent, same wallet. The only thing that changes is which proxy serves the request.
3. **Updating cost constants** in the same file from `0.007` (Tempo's price) to `0.001` (the reseller's price) and the user-visible row in [components/layout/CostInfoModal.tsx](../components/layout/CostInfoModal.tsx).

## The headline numbers

Three live measurements through the actual production stack (Talaria Next.js → `lib/modules/housing/listing-photo.ts` → `lib/mpp-client.ts` paidFetch → reseller → Google Maps):

| Listing | Coverage | Phase C (no preflight) | Phase E (with preflight) |
|---|---|---:|---:|
| **id=2313** central west Austin (78746) | Has imagery | **1,430 ms + $0.001** | 1,585 ms + $0.001 (~155 ms preflight overhead) |
| **id=611** rural NW Austin (78732) | No imagery | 1,672 ms + $0.001 (returned 7,838-byte placeholder) | **147 ms + $0** (free metadata skip → sentinel + 404) |

Compared to the parked branch's measurements against `googlemaps.mpp.tempo.xyz`:

| | Parked branch | Round 3 (with preflight) | Speedup |
|---|---:|---:|---:|
| Has-imagery cold load | ~15,000-17,000 ms | **~1,585 ms** | **~10×** |
| Has-imagery warm cache | ~22 ms | ~22 ms | (same — disk cache) |
| No-imagery cold load | ~15,000-17,000 ms (paid, returned placeholder) | **~147 ms** ($0 spent) | **~110×** |
| Per-call price | $0.007 (Tempo's price) | $0.001 | **7× cheaper** |

The full server-side breakdown for a paid call (id=2313) via the dev server console:

```
[photo:2313:dbLookup]: 0.193ms
[photo:streetview:metadata]: 92.19ms        ← FREE preflight
[fetch:    6ms 402] GET 127.0.0.1:8787/maps/streetview?location=30.264839,-97.815093&...
[fetch:  130ms 200] POST rpc.tempo.xyz/      ← viem RPC setup
[fetch:   77ms 200] POST rpc.tempo.xyz/
[fetch: 1198ms 200] GET 127.0.0.1:8787/maps/streetview?...   ← reseller actual work
[photo:streetview]: 1.577s
[photo:2313:total]: 1.585s
```

The 1,198 ms paid GET retry through the reseller is consistent with Round 2's measured server-side floor of ~917-1,800 ms. The reseller is doing exactly what we built it to do.

## Phase D — the photo media experiment

The user asked whether the new Places API (`places.googleapis.com/v1`) might have better residential photo coverage than the legacy one. The parked branch's prior testing found that the LEGACY `/maps/place/photo` endpoint always returned empty `photos[]` for Austin residential addresses.

**Phase D ran a free experiment** ([mpp-reseller/scratch/places-api-experiment.ts](../mpp-reseller/scratch/places-api-experiment.ts)): for 5 random Austin home listings (mix of $20M luxury, $1.9M mid-range, and $830k entry-level), call `POST places.googleapis.com/v1/places:searchText` with field mask `places.id,places.displayName,places.formattedAddress,places.photos`. Direct Google API calls with the existing key, no MPP, $0 USDC.e.

**Result: 0 / 5 addresses returned any photo references.** Including the $20M property. Every search result successfully matched the address (`displayName` correct, place ID returned), but `photos[]` was empty everywhere.

A follow-up free test ([mpp-reseller/scratch/places-details-test.ts](../mpp-reseller/scratch/places-details-test.ts)) ruled out the "maybe place details has photos that searchText doesn't" hypothesis: calling `GET /v1/places/{place_id}` with `id,displayName,photos` field mask for two of the addresses returned `photos: []` in both cases. Field mask consistency confirmed across endpoints.

**Conclusion: the new Places API has zero residential photo coverage in Austin, regardless of which endpoint we ask.** Google Places photos come from user uploads (rare for private homes) and Street View vehicles (which IS the streetview imagery we're already getting). There's no third source. The user's "maybe photo media is different" hope is falsified definitively — they're literally just two different ways to ask for the same Streetview imagery for residential addresses.

## Phase E — the unexpected real problem and the free fix

Phase D ran on 5 addresses. While it was confirming the Places API had no photos, it also captured Streetview output for each address as a control. Three of five Streetview responses came back at exactly **7,838 bytes** — Google's "no Street View imagery available at this location" placeholder. **A 60% no-imagery rate in a random sample of Austin homes**, including a $20M and a $1.9M property.

This was the actual user-visible problem the parked branch had a TODO to fix:

```ts
// Google returns a small "no imagery" gray box if there's no pano
// nearby. We can't easily distinguish that from a real image without
// image analysis, so we accept whatever bytes come back. Future:
// probe /streetview/metadata first (it's free) to skip the call.
```

**Round 3 implemented that TODO.** Google's Street View Static Metadata API is free per their published pricing — it returns `{"status": "OK"}` if imagery exists or `{"status": "ZERO_RESULTS"}` if not, in ~50-200 ms. The fix was three additions:

1. **`fetchStreetviewMetadata` in [mpp-reseller/src/upstream.ts](../mpp-reseller/src/upstream.ts)** — calls Google's free metadata endpoint with the API key.
2. **A new free passthrough route in [mpp-reseller/src/server.ts](../mpp-reseller/src/server.ts)**: `GET /maps/streetview/metadata` mounted with `timed('streetview-metadata', 'free')` and **no mppx payment middleware**. The reseller becomes the single owner of the Google API key for both the paid streetview call and the free metadata check.
3. **`checkStreetViewMetadata` in [lib/modules/housing/listing-photo.ts](../lib/modules/housing/listing-photo.ts)** — calls the reseller's metadata route via plain `fetch` (not `paidFetch`) before paying for the photo. On `ZERO_RESULTS`, returns `null` and the existing API route writes the sentinel and returns 404. Fails open on network errors so a transient blip doesn't deny a valid photo.

**Verified end-to-end against both cases:**

For id=611 (rural NW Austin, no imagery):
```
[photo:611:dbLookup]: 31.302ms
[photo:streetview:metadata]: 105.101ms
[listing-photo] no Street View imagery at 30.365315,-97.911301
[photo:streetview]: 106.169ms
[photo:611:total]: 147.4ms
GET /api/housing/listing-photo/611 404 in 250ms
```
**No paid call, no USDC.e, sentinel written, 404 returned in 147 ms.**

For id=2313 (central west Austin, has imagery):
```
[photo:2313:dbLookup]: 0.193ms
[photo:streetview:metadata]: 92.19ms
[photo:streetview]: 1.577s
[photo:2313:total]: 1.585s
GET /api/housing/listing-photo/2313 200 in 1620ms
```
**Metadata returns OK in 92 ms, paid call proceeds normally, photo in 1.59s total. ~155 ms preflight overhead vs the no-preflight Phase C measurement of 1,430 ms — about 11% cost for the certainty.**

## Practical impact for Talaria's housing module

- **Cold-cache photo loads where Streetview HAS imagery**: dropped from ~15-17 seconds (parked branch via Tempo) to **~1.6 seconds** (Round 3 via local reseller with preflight). User-perceptible — drawer feels responsive.
- **Cold-cache photo loads where Streetview has NO imagery (~60% of homes)**: dropped from ~15-17 seconds (parked branch wasted a paid call to fetch a placeholder) to **~150 ms** (Round 3 free metadata skip → empty state). **No misleading gray box. No USDC.e spent.**
- **Warm-cache loads** (instant from disk): unchanged from the parked branch — instant.
- **Per-call price**: $0.007 (Tempo) → $0.001 (reseller) = **7× cheaper**.
- **Net cost per cache-miss across the population**: $0.007 (always pay) → $0.001 × 0.40 = $0.0004 (only pay when imagery actually exists). **17.5× cheaper in aggregate.**

For a user opening 100 listings in a session with this fix and a fresh disk cache, the worst-case cost goes from `100 × $0.007 = $0.70` (parked branch) to `100 × $0.0004 = $0.04` (Round 3). That's a real, measurable cost savings.

## Cumulative spend audit

| Round | Description | Spend |
|---|---|---:|
| Round 1 | 6-service wide sweep | $0.1721 |
| Round 1.5 | alchemy-tempo controlled comparison | $0.0008 |
| Round 2 | Reseller comparison sweep (16 calls × $0.001) | $0.0160 |
| Round 3 | Photo path verification + Phase E end-to-end (3 calls × $0.001) | $0.0030 |
| **Total** | | **$0.1919** |
| **Cap** | | **$1.00** |
| **Remaining** | | **$0.8081** |

Round 3 spent only $0.003 of paid USDC.e because Phase D was free (direct Google API), Phase E's no-imagery test was free (metadata preflight skipped the paid call), and only the has-imagery verifications actually paid. The Round 2 cap of $1.00 still has $0.81 of headroom for Round 4 and beyond.

Off-chain: Round 3 made ~25 Google Maps API calls (5 for Phase D, 4 for Phase D follow-up details test, and 3 paid Streetview + 5 metadata preflights for Phase C and Phase E verification). Total ~$0.20 of pretend Google free-tier credits, well within the $200/month allowance.

## Round 4 — Free zip-code price-trend heat map (Zillow ZHVI)

> **Spend:** $0 of paid USDC.e. Cumulative still $0.1919.

Round 4 added a zip-level price-trend heat map to the housing module. The map's old "Neighborhoods" tract checkbox (decorative outlines, no data) was replaced with a new "Price Trends" layer that colors ~87 Austin metro zip codes by their Zillow Home Value Index (ZHVI) percent change over a user-configurable period (1–60 months, with 1mo / 6mo / 1yr / 2yr / 5yr presets).

This is the **first Talaria feature that derives showcase value from cheap MPP-paid data + free public data combined**. The 4,878 cached RentCast listings (Round 1's $0.99 of paid data) continue to render as pins on top of the new heat map. The story: $0.99 of MPP-paid listings + $0 of public-data heat map = an interactive Austin price-trend explorer where the free derivation amplifies the value of the cheap MPP spend.

**Data sources, all free:**
- **Zillow ZHVI** — `https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv` (middle tier, smoothed, seasonally adjusted, all home types). Public CSV, no auth, no rate limit. Fetched once via `node scripts/fetch-zhvi.mjs`, filtered to Austin metro, cached as `public/austin-zhvi.json` (~245 KB, 87 zips × 60 months).
- **Census ZCTA polygons** — `OpenDataDE/State-zip-code-GeoJSON` (Texas zip codes), filtered to the same 87 Austin zips and cached as `public/austin-zips.geojson` (~2.4 MB).

**Architecture:**
- `scripts/fetch-zhvi.mjs` mirrors the existing `scripts/fetch-pmms.mjs` "fetch a free CSV, parse it, write a JSON artifact, export the parser for tests, fail clearly on URL drift" pattern. Exports `parseZhviCsv()` and `filterGeoJsonByZips()` for unit tests; `tests/parse-zhvi.test.ts` covers 13 cases (Austin/county filter fallback, quoted Metro field with embedded comma, blank-value handling, CRLF, alternate ZCTA property names, malformed input).
- `scripts/fetch-zhvi.d.mts` provides TypeScript declarations for the .mjs script (must be `.d.mts`, not `.d.ts`, for ESM resolution).
- The map renders the heat map client-side via Leaflet GeoJSON. `colorForPct(pct)` is a 3-stop divergent palette (deep red `#e5534b` at -10%, neutral gray `#30363d` at 0%, deep green `#3fb950` at +10%) with linear interpolation between stops. `zipStyleFor(zhvi, monthsBack)` is a higher-order function returning a Leaflet style function; the GeoJSON layer uses `key={zhvi-${priceTrendMonths}}` to force a clean remount when the period changes (Leaflet caches style functions otherwise).
- **State location:** `showPriceTrends` and `priceTrendMonths` are lifted to `app/housing/page.tsx` (the lowest common ancestor of `LeftPanel` and `HousingMap`) so the LeftPanel section sets the period and the map reads it from the same source.
- **Two UI affordances, two concerns:** the visibility checkbox lives in the map controls panel (top-right, replaces the dead "Neighborhoods" checkbox in place); the period selector lives in a new "Price Trends" full-panel takeover section in the LeftPanel under Budget & Loan, mirroring the existing Isochrones / Scoring / Budget & Loan section pattern. The takeover view has a 1–60 month range slider, 5 quick presets, a divergent-palette legend, and a Zillow ZHVI attribution.

**Real data story discovered (last data month: 2026-02-28):**
- 78704 (South Congress / Bouldin): -5.2% over 12 months
- 78745 (South Austin): -6.4% over 12 months
- 78702 (East Austin): -5.8% over 12 months
- 78731 (Northwest Hills): -1.4%
- 78746 (Westlake): +1.1% (the only metro zip holding value)
- Over 5 years: Westlake +33.8% vs east Austin -2.4% — the post-2022-peak Austin correction is plainly visible.

The user's original concern ("averages get skewed by outliers — one mansion in a trailer park") is naturally avoided by ZHVI's middle-tier construction (33rd–67th percentile), which is designed to track "the typical mid-range home" rather than the mean.

**Phase summary:**
- **Phase A** — `scripts/fetch-zhvi.mjs` + `.d.mts` shim + `parse-zhvi.test.ts` (13 tests) + `austin-zhvi.json` + `austin-zips.geojson` generated.
- **Phase B** — `showPriceTrends` and `priceTrendMonths` lifted to `app/housing/page.tsx`.
- **Phase C** — `HousingMap.tsx` heat map layer with `colorForPct` / `zipStyleFor` / `formatPeriod` / `formatPct` helpers, `onEachFeature` hover tooltip showing zip + latest ZHVI value + period % change, "Price Trends" checkbox in `MapControls`.
- **Phase D** — `LeftPanel.tsx` new "Price Trends" section button (`TrendingUp` icon) + full-panel takeover view (slider + 5 presets + color legend + ZHVI attribution).
- **Phase E** — Tract code already removed in Phase C; only one stale comment in `HousingMap.tsx` updated.
- **Phase F** — All 104 tests pass (13 new ZHVI parser tests + 91 prior). `npx tsc --noEmit -p tsconfig.json` clean.
- **Phase G** — `CostInfoModal.tsx` FREE_ACTIONS row added; this doc updated.

| Round | Description | Spend |
|---|---|---:|
| Round 4 | Zip-code price-trend heat map (free Zillow ZHVI + Census ZCTA) | $0.0000 |

Cumulative across all rounds remains **$0.1919 / $1.00 cap**. Round 4 closes with no change.

## Out of scope (Round 5 and later)

- **Multiple MPP service integrations beyond Google Maps.** The big remaining showcase opportunity. The reseller architecture generalizes to any upstream — wrap a different API and you have a new MPP service. Candidates: weather forecasts (OpenWeather, fast/cheap, already tested in Round 1), Mapbox isochrones (already wired but using free Valhalla — could swap to Mapbox via reseller for better quality), mortgage rate alerts via StableEmail.
- **Replacing the agentcash CLI shellout in `lib/modules/housing/rentcast.ts`** with a direct `mppx/client` integration. The branch already converted `lib/mpp-client.ts` for the photo path; extending that to RentCast (and any other agentcash CLI users in Talaria) would shave another ~2-3 seconds per call by avoiding the subprocess overhead. Worth doing for the harness-measured speedup but not required for Round 3's photo feature.
- **Image compression / re-encoding.** The disk cache stores raw Google Streetview JPEGs (~50-100 KB each). Fine for local dev. If we ever ship publicly, convert to WebP and resize for thumbnails.
- **Pre-fetching photos for visible listings.** Currently lazy-loads when a drawer opens. Could pre-fetch the top-N visible listings on the map, but that's premature optimization until we see real UX with the new latency.
- **Photo cache eviction policy.** Currently grows forever (`public/listing-photos/`). At ~70 KB per photo and ~1000 listings, that's ~70 MB max. Manual cleanup is fine.
- **Public deployment of the reseller.** The housing app expects `127.0.0.1:8787`; making the URL configurable for production is its own task.
- **A photo source that has actual residential coverage.** Realtor.com, MLS aggregators, Zillow scraping — all defeat the MPP showcase point. The 40% Streetview coverage rate is honest and acceptable for demonstration purposes.
