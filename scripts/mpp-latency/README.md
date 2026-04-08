# MPP Latency Harness — Round 1

Standalone test scripts that hit several MPP services and record per-call response times. Built to answer: **is the 15-35s Google Maps latency MPP-wide, proxy-class-specific, or just Google Maps?**

Round 2 (the reseller, with deep instrumentation) is a separate workstream — see [the plan](../../C:/Users/Gannon%20Combs/.claude/plans/zazzy-skipping-teapot.md).

## Layout

```
scripts/mpp-latency/
├── runner.ts        # oneShotMppCall() — instrumented MPP client (~80 lines, no SQLite)
├── services.ts      # Endpoint catalog with verified charge intents
├── budget.ts        # Persistent JSON spend tracker (global + per-service caps)
├── log.ts           # NDJSON writer + live stdout
├── analyze.ts       # Read NDJSON → markdown report
├── sweeps/
│   ├── _common.ts   # Shared sweep harness
│   ├── agentres.ts      # FREE — dry run, no payment
│   ├── openweather.ts   # $0.006 × 5
│   ├── timezone.ts      # $0.006 × 5
│   ├── mapbox.ts        # $0.0037 × 5
│   ├── alchemy.ts       # $0.0001 × 20  (--max-calls N for smoke test)
│   ├── rentcast.ts      # $0.033 × 3
│   └── googlemaps.ts    # $0.008 × 5 × 3 paths
├── logs/            # gitignored: NDJSON per call + budget.json
└── reports/         # gitignored: markdown summaries
```

## Safety

1. **Refuses session intents.** Only `intent="charge"` accepted. Session intents (which open escrow channels of unknown size) are detected in `parseWwwAuthenticate` and refused.
2. **Two-layer budget cap, fail-closed.** Global $1.00 + per-service sub-caps. Both checked **before** every call. State persists in `logs/budget.json` across crashes/restarts.
3. **Preflight verification.** Each sweep calls `previewMppCost` (free 402 probe — no payment) to confirm `charge` intent and that the cost matches the catalog within 1.5×. Drift aborts.
4. **No production pollution.** The harness re-implements the 402 dance from scratch — does NOT import `lib/db.ts`, `lib/mpp.ts`, or `lib/mpp-client.ts`. Test traffic never lands in `mpp_transactions` or `mpp_cache`.
5. **60s timeout** (vs production's 15s) so we actually capture the 15-35s outliers we're trying to measure.
6. **SIGINT clean-exit.** Ctrl-C finalizes the in-flight NDJSON line and prints partial totals.

## Run

**Run from the repo root.** Sweeps use the `agentcash` CLI (the same call path production uses), so the local agentcash install must be initialized before any paid sweep.

### 1. Free dry run (no spend)

```bash
npx tsx scripts/mpp-latency/sweeps/agentres.ts
```

Exercises the entire pipeline (fetch → NDJSON → analyzer) at $0 risk.

### 2. Single paid smoke test (after explicit auth)

```bash
npx tsx scripts/mpp-latency/sweeps/alchemy.ts --max-calls 1
```

One $0.0001 call. Confirms budget tracker decremented and NDJSON record valid.

### 3. Full paid sweep set (after explicit auth)

Run sweeps individually so you can pause and inspect:

```bash
npx tsx scripts/mpp-latency/sweeps/openweather.ts
npx tsx scripts/mpp-latency/sweeps/timezone.ts
npx tsx scripts/mpp-latency/sweeps/mapbox.ts
npx tsx scripts/mpp-latency/sweeps/alchemy.ts
npx tsx scripts/mpp-latency/sweeps/rentcast.ts
npx tsx scripts/mpp-latency/sweeps/googlemaps.ts
```

### 4. Generate report

```bash
npx tsx scripts/mpp-latency/analyze.ts
```

Reads all NDJSON, prints a markdown report, and writes a copy to `reports/report-<timestamp>.md`.

## Live output format

Each call streams one stdout line:

```
[openweather-current /openweather/current-weather] total=423ms (init=189 pay=210 retry=24 body=0)
```

- `init` = T0→T1 — initial fetch (until 402 received)
- `pay` = T1→T2 — ethers transfer + tx.wait()
- `retry` = T2→T3 — retry fetch (until headers received)
- `body` = T3→T4 — response body fully read
- `total` = T0→T4

## NDJSON record schema

```json
{
  "run_id": "round1-2026-04-08",
  "ts": "2026-04-08T14:23:11.234Z",
  "service": "openweather-current",
  "endpoint": "/openweather/current-weather",
  "proxy_class": "locus",
  "cost_usd": 0.006,
  "phases_ms": {
    "initial_402": 189,
    "payment": 210,
    "retry_response": 24,
    "body": 0,
    "total": 423
  },
  "tx_hash": "0x...",
  "result": "success",
  "payload_bytes": 421,
  "status_code": 200
}
```

## Budget reset

The budget file `logs/budget.json` accumulates spend across runs. To reset (only after explicit user OK):

```bash
node -e "require('./scripts/mpp-latency/budget').resetBudget()"
```

…or just delete the file. Either way, **only do this with explicit user authorization** — the cap exists for a reason.

## What this round does NOT do

- DNS / TCP / TLS phase splitting (Round 2)
- ethers RPC-level instrumentation (Round 2)
- Tempo chain-health background polling (Round 2)
- Direct-HTTPS control measurements (Round 2)
- Cold-vs-warm forced socket recycling (Round 2)
- Concurrency tests (Round 2)
- Building the Google Maps reseller (Round 2)
