# mpp-reseller

A local MPP reseller for three Google Maps endpoints. **Round 2** of the MPP latency investigation. See [docs/mpp-latency-round1-findings.md](../docs/mpp-latency-round1-findings.md) for the Round 1 conclusions that motivated this.

The reseller wraps Google Maps Platform behind the Machine Payments Protocol (MPP) so that any agent with a Tempo USDC.e wallet can call our endpoints with no API key, no signup, no anything — just pay-per-request. We control the proxy code, so we can deeply instrument what's happening on each call. The point of Round 2 is to prove we can land at the ~4.5s Locus/direct floor and escape the ~20s Tempo proxy class entirely.

## Two modes

The server starts up TWO independent `Mppx` instances and exposes them on parallel route prefixes:

| Path prefix | Mode | `waitForConfirmation` |
|---|---|---|
| `/maps/...`, `/places/v1/...` | confirmed (default) | `true` (waits for on-chain inclusion) |
| `/fast/maps/...`, `/fast/places/v1/...` | fast | `false` (broadcasts after simulation) |

Both modes call the same handler functions and the same upstream Google Maps API. The only difference is whether mppx waits for the payment transaction to confirm before letting the request proceed. This is the controlled experiment that nobody else can run, because nobody else owns both the client and the proxy.

## Endpoints

| Method | Path (confirmed) | Path (fast) | Upstream |
|---|---|---|---|
| GET | `/maps/streetview` | `/fast/maps/streetview` | Static Street View API |
| GET | `/maps/place/textsearch/json` | `/fast/maps/place/textsearch/json` | Places Text Search (legacy) |
| GET | `/places/v1/places/:placeId/photos/:photoId/media` | `/fast/places/v1/places/:placeId/photos/:photoId/media` | Places API (new) photo media |

Plus:
- `GET /health` — startup readiness check (free)
- `GET /internal/recent` — last 50 NDJSON records, localhost only (free)

## Pricing

$0.001 per call across all three endpoints. Cheap enough for thirty test calls to cost ~$0.03 — and since you're paying yourself (USDC.e flows from your agentcash wallet to the reseller's wallet, both controlled by you), the net cost is essentially zero.

## Setup

### 1. Install dependencies

```bash
cd mpp-reseller
npm install
```

### 2. Generate the reseller wallet (one-time)

```bash
npm run create-wallet
```

This generates a brand-new EVM wallet at `mpp-reseller/keys/reseller-wallet.json` (gitignored). The script:

- **Refuses to overwrite** if a wallet already exists. To regenerate, manually delete the file.
- **Refuses to write** anywhere outside the `mpp-reseller/keys/` directory. The path is hard-coded in the source — there's no env-var override.
- **Refuses to write** any path containing `.agentcash`. Your existing agentcash wallet at `~/.agentcash/wallet.json` is permanently off-limits to this script.
- **Round-trip verifies** the generated wallet (re-reads the file, derives the address from the stored privateKey, asserts they match).
- **Prints the address** but NOT the privateKey. You're expected to open the file yourself and back up the privateKey field to your password manager.
- **Generates an `MPP_SECRET_KEY`** (random 32-byte hex) for you to paste into `.env`.

After running, **back up the privateKey field** from `keys/reseller-wallet.json` before doing anything else.

### 3. Get a Google Maps API key

The reseller becomes the proxy operator, which means **you** hold the upstream Google Maps key (not Tempo). Free tier is plenty for testing — Google gives a $200/month credit and Streetview Static is $7/1000 calls.

1. Go to the Google Cloud Console: <https://console.cloud.google.com/>
2. Create a new project (or pick an existing one). Name it whatever — e.g. `mpp-reseller-dev`.
3. Enable the **Maps Platform** APIs you need:
   - **Street View Static API** — for the `/maps/streetview` endpoint
   - **Places API** (the legacy one with the blue icon) — for `/maps/place/textsearch/json`
   - **Places API (New)** (the green icon) — for `/places/v1/.../photos/.../media`
   - You can enable all three at once via the Maps Platform onboarding wizard.
4. Go to **APIs & Services → Credentials → Create Credentials → API key**.
5. Copy the key. It looks like `AIzaSyC...`.
6. Click **Edit API key** and set restrictions:
   - **Application restrictions:** None (we're calling from a local server with no fixed IP).
   - **API restrictions:** Restrict to "Street View Static API", "Places API", and "Places API (New)". This limits the blast radius if the key ever leaks.
7. Save.

### 4. Create your `.env`

```bash
cp .env.example .env
```

Open `mpp-reseller/.env` in your editor and fill in:

- `GOOGLE_MAPS_API_KEY` — the key from step 3 above
- `MPP_SECRET_KEY` — the value `npm run create-wallet` printed earlier

The other values have sensible defaults.

### 5. Type check

```bash
npx tsc --noEmit
```

Should print nothing on success.

### 6. Start the server

```bash
npm start
```

The startup banner will print the reseller's wallet address and confirm both modes are mounted. The server listens on `127.0.0.1:8787` (HTTP, not HTTPS — local-only).

### 7. Verify with curl (free, no payment)

```bash
# Health
curl http://127.0.0.1:8787/health

# Recent records (empty until you make a paid call)
curl http://127.0.0.1:8787/internal/recent
```

Both should return JSON.

### 8. Verify the 402 challenge (still free)

```bash
node ../node_modules/agentcash/dist/esm/index.js check http://127.0.0.1:8787/maps/streetview --format json
```

Should report `intent="charge"`, `payTo` = your reseller wallet address, `amount=1000`, network = `tempo:4217`. No payment is sent.

### 9. Make your first paid call

```bash
node ../node_modules/agentcash/dist/esm/index.js fetch \
  "http://127.0.0.1:8787/maps/streetview?location=30.27,-97.74&size=600x400" \
  --format json
```

agentcash will use **your** main wallet (`~/.agentcash/wallet.json`) to pay $0.001 USDC.e to the reseller. The reseller will verify the payment, call Google Maps, and stream the Streetview image bytes back. Watch the reseller's stdout for the timing breakdown.

## Files

```
mpp-reseller/
├── README.md                       # this file
├── package.json                    # hono, mppx, viem
├── tsconfig.json
├── .env                            # secrets (gitignored)
├── .env.example                    # template
├── .gitignore
├── src/
│   ├── server.ts                   # Hono app, dual mppx, six routes, listen
│   ├── wallet.ts                   # Load wallet from keys/ (deny-list checks)
│   ├── config.ts                   # Env-var loading, validation, frozen config
│   ├── upstream.ts                 # Three Google Maps fetch helpers
│   └── instrumentation.ts          # T0-T6 phase timing, NDJSON, ring buffer
├── scripts/
│   └── create-wallet.ts            # Generate new wallet with safety guardrails
├── keys/                           # gitignored
│   └── reseller-wallet.json        # { privateKey, address, ... }
└── logs/                           # gitignored
    └── YYYY-MM-DD.ndjson           # daily-rotated per-request logs
```

## Wallet safety — the rules

1. **`~/.agentcash/wallet.json` is permanently off-limits** to all reseller code. Never read, written, or referenced by path.
2. **The reseller wallet path is hard-coded** in `src/wallet.ts` and `scripts/create-wallet.ts`. No env-var override. The only way to point at a different file is to edit the source.
3. **Both files run deny-list checks at every load:** the resolved absolute path must contain `mpp-reseller` and `keys` segments, and must NOT contain `.agentcash` anywhere.
4. **`create-wallet.ts` refuses to overwrite** an existing wallet file. Manual delete required.
5. **`create-wallet.ts` round-trip verifies** every wallet it creates.
6. **The private key is never printed to stdout.** The script tells you the address and the file path; you open the file yourself to back up the key.
7. **The `keys/` directory is gitignored** in two places: `mpp-reseller/.gitignore` and the talaria root `.gitignore`.

## Running against the Round 1 harness

Once the server is up, the Round 1 latency harness can sweep it like any other MPP service. Add entries to [scripts/mpp-latency/services.ts](../scripts/mpp-latency/services.ts) pointing at the reseller's local URLs (both modes), then run the existing sweep scripts. Results will land in `scripts/mpp-latency/logs/` and the analyzer will pivot them alongside the Round 1 baseline.

## What this reseller does NOT do (yet)

- **No HTTPS.** Plain HTTP localhost only. If you ever deploy this publicly, that's its own infra exercise.
- **No CORS.** No browser is calling the reseller in Round 2.
- **No rate limiting / quotas.** Single-tenant, single-user.
- **No persistent replay-protection store.** mppx defaults to an in-memory store. Fine for a single process.
- **No multi-method support.** Tempo USDC.e charge intents only. No Stripe fallback, no x402, no Lightning.
- **No public deployment.** Run locally. The user may eventually launch this publicly, but that's a separate project.
