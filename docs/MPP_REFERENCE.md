# Machine Payments Protocol (MPP) — Developer Reference

> Last updated: 2026-03-20
> This file is designed to be used as `CLAUDE.md` or included in project context for Claude Code sessions.

## What is MPP?

The Machine Payments Protocol is an open standard for machine-to-machine payments over HTTP. Co-authored by **Stripe** and **Tempo Labs**, with **Visa** and **Mastercard** as design partners. Launched March 18, 2026.

MPP repurposes **HTTP 402 (Payment Required)** — a status code reserved since 1997 but never standardized — as the mechanism for agents to pay for resources programmatically.

**Core idea:** Payment replaces authentication. Instead of API keys, billing accounts, and signup flows, an agent simply pays per-request. No key needed. No human in the loop.

**IETF spec:** `draft-ietf-httpauth-payment` (the base Payment HTTP Authentication Scheme)
**Stripe charge intent spec:** `draft-stripe-charge-00`

---

## The 402 Flow

Every MPP transaction follows this pattern:

```
Agent (Client)                    Service (Server)                   Payment Rail
     |                                  |                                  |
     |  1. GET /resource                |                                  |
     |--------------------------------->|                                  |
     |                                  |                                  |
     |  2. HTTP 402 Payment Required    |                                  |
     |     WWW-Authenticate: Payment    |                                  |
     |     (amount, currency, method,   |                                  |
     |      intent, challenge ID)       |                                  |
     |<---------------------------------|                                  |
     |                                  |                                  |
     |  3. Agent authorizes payment     |                                  |
     |     (wallet sign, SPT mint,      |                                  |
     |      card charge — depends on    |                                  |
     |      payment method)             |                                  |
     |------------------------------------------------------------------>  |
     |                                  |                                  |
     |  4. GET /resource                |                                  |
     |     Authorization: Payment       |                                  |
     |     <base64url credential>       |                                  |
     |--------------------------------->|                                  |
     |                                  |  5. Verify payment               |
     |                                  |--------------------------------->|
     |                                  |                                  |
     |  6. HTTP 200 OK                  |                                  |
     |     Payment-Receipt: <receipt>   |                                  |
     |     (resource content)           |                                  |
     |<---------------------------------|                                  |
```

**Key properties:**
- The 402 challenge is self-describing — it tells the agent exactly what to pay, how much, and which payment methods are accepted
- The credential is sent as an `Authorization: Payment` header on the retry request
- The receipt is returned as a `Payment-Receipt` header alongside the resource
- Challenge IDs are single-use (replay protection)
- All communication must use HTTPS (TLS 1.2+)

---

## Payment Methods

MPP is rail-agnostic. The protocol defines the 402 handshake; the payment method determines how money actually moves. Four methods are currently specified:

### 1. Tempo (Stablecoin — USDC on Tempo/Base)

**Spec:** Built into the core MPP reference implementation
**Settlement:** On-chain, near-instant (~2 seconds on Tempo, ~2 seconds on Base)
**Minimum payment:** Fractions of a cent (true micropayments)
**Use case:** API-to-API payments, micropayments, machine-to-machine

```javascript
import { Mppx, tempo } from 'mppx/server';

const mppx = Mppx.create({
  methods: [
    tempo.charge({
      currency: '0x20c0000000000000000000000000000000000000', // USDC on Tempo
      recipient: walletAddress,
      testnet: true,
    }),
  ],
  secretKey: mppSecretKey,
});
```

**Agent side:** Agent has a Tempo wallet funded with USDC. Signs transaction on-chain.
**Server side:** Verifies on-chain payment, delivers resource.
**Visa involvement:** None (pure crypto rail).

### 2. Stripe (SPTs — Shared Payment Tokens)

**Spec:** `draft-stripe-charge-00` (IETF submission)
**Settlement:** Stripe processes a PaymentIntent; settlement timing follows standard Stripe rules (typically T+2 for cards)
**Minimum payment:** Subject to Stripe minimums (~$0.50 for cards)
**Use case:** Card-backed agent payments, higher-value transactions

```javascript
// Server: accept Stripe payments via MPP
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// In the 402 challenge, specify:
{
  "amount": "5000",        // $50.00 in cents
  "currency": "usd",
  "methodDetails": {
    "networkId": "profile_abc",   // Stripe Business Network Profile
    "paymentMethodTypes": ["card", "link"]
  }
}

// When credential received, create PaymentIntent:
const pi = await stripe.paymentIntents.create({
  amount: 5000,
  currency: 'usd',
  shared_payment_granted_token: credential.spt,  // e.g., "spt_1N4Zv..."
  confirm: true,
  automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
  metadata: { challenge_id: challenge.id },
}, {
  idempotencyKey: `${challenge.id}_${credential.spt}`
});
```

**Agent side:** Agent creates SPT via Stripe.js using buyer's saved payment method (card in Link, bank account, etc.). Both client and server need Stripe accounts.
**Server side:** Creates PaymentIntent with SPT, verifies `status: "succeeded"`.
**Visa involvement:** If SPT is backed by a Visa card, the underlying PaymentIntent settles through VisaNet. If backed by bank account (Instant Bank Payments via Link), Visa is bypassed entirely. **The protocol abstracts away the payment method — the agent and server don't know or care which rail is used underneath.**

### 3. Card (Visa Card Spec)

**Spec:** Visa's card-based MPP specification (released March 18, 2026)
**SDK:** `@anthropic-payments/visa-card-sdk` (or equivalent — check Visa developer docs)
**Settlement:** Standard card rails (VisaNet → Issuer → Acquirer)
**Use case:** Direct card payments without Stripe intermediation

This is Visa's defensive spec — it ensures agents can pay with cards directly through card rails without requiring Stripe/SPTs as an intermediary. Processor-agnostic (works with any acquirer).

**Visa involvement:** Full. Transaction flows through VisaNet. Visa sees the transaction, earns interchange.

### 4. Lightning (Bitcoin via Lightning Network)

**Spec:** Extended by Lightspark
**Settlement:** Near-instant via Lightning Network
**Use case:** Bitcoin-denominated micropayments

---

<!-- UPDATEABLE SECTION: Add new payment methods here as they launch -->
### Upcoming / Planned Methods
- **Solana** — Direct SOL/USDC payments on Solana (in development)
- Additional methods can be added by anyone — MPP is extensible by design

---

## The Proxy Pattern (Key Concept)

The proxy/reseller model is the primary way services are onboarded to MPP today.

### How it works

A **proxy operator** holds API keys for upstream services and resells access per-request via MPP.

```
Agent                    Proxy (e.g., Tempo)              Upstream API (e.g., OpenAI)
  |                            |                                    |
  | GET openai.mpp.tempo.xyz   |                                    |
  |--------------------------->|                                    |
  |                            |                                    |
  | 402 (pay $0.05)            |                                    |
  |<---------------------------|                                    |
  |                            |                                    |
  | Pays $0.05 USDC            |                                    |
  |--------------------------->|                                    |
  |                            | Calls api.openai.com               |
  |                            | (with Tempo's API key: sk-...)     |
  |                            |----------------------------------->|
  |                            |                                    |
  | 200 OK + receipt           | Response                           |
  |<---------------------------|<-----------------------------------|
```

### Key implications

- **Agent needs NO API key.** Payment replaces authentication.
- **Proxy operator holds the API key.** They have a normal billing relationship with the upstream.
- **Proxy operator captures the spread** between what they charge per-request and what upstream charges them. This is the business model.
- **Upstream's PSP is irrelevant.** The proxy pays OpenAI however OpenAI wants to be paid. The agent pays the proxy via MPP.
- **The upstream doesn't know MPP exists.** From OpenAI's perspective, Tempo is just another API customer.

### Running your own proxy

```javascript
import { Mppx, tempo } from 'mppx/server';

const mppx = Mppx.create({
  methods: [
    tempo.charge({
      currency: PATH_USD,
      recipient: myWalletAddress,
    }),
  ],
  secretKey: process.env.MPP_SECRET,
});

// Wrap any upstream API:
export async function handler(request) {
  const response = await mppx.charge({ amount: '0.05' })(request);

  if (response.status === 402) return response;

  // Agent paid — now call upstream with YOUR key
  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: request.body,
  });

  return response.withReceipt(upstream);
}
```

---

## Day 1 Service Directory

All available at `*.mpp.tempo.xyz` (Tempo operates the proxies).
Discover services at: https://tempo.xyz/services
Machine-readable directory: `llms.txt` files at service endpoints.

<!-- UPDATEABLE SECTION: Add new services as they launch -->

### AI / LLM
| Provider | Description | Endpoint |
|----------|-------------|----------|
| OpenAI | Chat, embeddings, image gen, audio | `openai.mpp.tempo.xyz` |
| Anthropic | Claude (Sonnet, Opus, Haiku) | `anthropic.mpp.tempo.xyz` |
| Google Gemini | Text gen, Veo video, Nano Banana | `gemini.mpp.tempo.xyz` |
| OpenRouter | Unified API for 100+ LLMs | `openrouter.mpp.tempo.xyz` |
| fal.ai | Image/video/audio gen (600+ models: Flux, SD, Recraft, Grok) | `fal.mpp.tempo.xyz` |
| ElevenLabs | TTS, STT, voice cloning | `elevenlabs.mpp.tempo.xyz` |
| StableStudio | Image/video creation (Nano Banana, GPT Image, Grok, Flux, Sora, Veo) | `stablestudio.dev` |

### Search & Web
| Provider | Description | Endpoint |
|----------|-------------|----------|
| Parallel | Web search, page extraction, grounded chat | `parallel.mpp.tempo.xyz` |
| Exa | AI-powered web search and content retrieval | `exa.mpp.tempo.xyz` |
| SerpApi | Google Flights search, prices, schedules | `serpapi.mpp.tempo.xyz` |
| Firecrawl | Web scraping, crawling, structured data for LLMs | `firecrawl.mpp.tempo.xyz` |
| Browserbase | Headless browser sessions for scraping/automation | `browserbase.mpp.tempo.xyz` |
| Oxylabs | Web scraping with geo-targeting | `oxylabs.mpp.tempo.xyz` |

### Data & APIs
| Provider | Description | Endpoint |
|----------|-------------|----------|
| StableTravel | Travel APIs (flights, hotels, activities) via Amadeus/FlightAware | `stabletravel.dev` |
| FlightAPI | Real-time flight tracking, 700+ airlines | `flightapi.mpp.tempo.xyz` |
| GoFlightLabs | Flight tracking, prices, schedules | `goflightlabs.mpp.tempo.xyz` |
| AviationStack | Historical/real-time flight data, airports | `aviationstack.mpp.tempo.xyz` |
| Google Maps | Geocoding, directions, routes, weather | `googlemaps.mpp.tempo.xyz` |
| StableEnrich | Research APIs (people, companies, scraping, contact enrichment) | `stableenrich.dev` |
| StableSocial | Social media data (TikTok, Instagram, X, Facebook, Reddit) | `stablesocial.dev` |
| SpyFu | SEO rankings, PPC ads, domain analytics (18+ years) | `spyfu.mpp.tempo.xyz` |
| KicksDB | Sneaker market data (StockX, GOAT prices, history) | `kicksdb.mpp.tempo.xyz` |
| Twitter/X | X API v2 (tweets, users, search) | `twitter.mpp.tempo.xyz` |

### Infrastructure & Compute
| Provider | Description | Endpoint |
|----------|-------------|----------|
| Modal | Serverless GPU compute for AI/ML | `modal.mpp.tempo.xyz` |
| DigitalOcean | 1-click deploy of hosted MPP agents | `digitalocean.mpp.tempo.xyz` |
| Code Storage | Paid Git repos with authenticated clone URLs | `codestorage.mpp.tempo.xyz` |
| Object Storage | S3/R2-compatible storage, dynamic per-size pricing | `storage.mpp.tempo.xyz` |

### Communication
| Provider | Description | Endpoint |
|----------|-------------|----------|
| AgentMail | Email inboxes for AI agents (create, send, receive) | `agentmail.mpp.tempo.xyz` |
| StableEmail | Email delivery, forwarding, custom subdomains | `stableemail.dev` |
| StablePhone | AI phone calls, dedicated numbers, iMessage/FaceTime lookup | `stablephone.dev` |

### Blockchain
| Provider | Description | Endpoint |
|----------|-------------|----------|
| Alchemy | JSON-RPC and NFT APIs across 80+ chains | `alchemy.mpp.tempo.xyz` |
| Codex | GraphQL API for DeFi/blockchain data, 80+ networks | `codex.mpp.tempo.xyz` |
| Tempo RPC | Tempo blockchain JSON-RPC (mainnet + testnet) | `rpc.mpp.tempo.xyz` |

### Other
| Provider | Description | Endpoint |
|----------|-------------|----------|
| 2Captcha | CAPTCHA solving (reCAPTCHA, Turnstile, hCaptcha) | `twocaptcha.mpp.tempo.xyz` |

---

## NPM Packages

### `mppx` — Core MPP library

The reference implementation for both client and server.

```bash
npm install mppx
```

**Server (accepting payments):**
```javascript
import { Mppx, tempo } from 'mppx/server';

const mppx = Mppx.create({
  methods: [tempo.charge({ currency: PATH_USD, recipient: addr })],
  secretKey: secret,
});

// Wrap any handler:
const response = await mppx.charge({ amount: '0.01' })(request);
if (response.status === 402) return response;
return response.withReceipt(Response.json({ data: '...' }));
```

**Client (making payments):**
```javascript
import { PaymentClient } from 'mppx/client';

const client = new PaymentClient({
  wallet: myWallet,  // Tempo wallet for USDC payments
});

// Makes request, handles 402, pays, retries automatically:
const response = await client.fetch('https://openai.mpp.tempo.xyz/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: 'gpt-4', messages: [...] }),
});
```

### Tempo CLI (`tempo`)

Command-line tool for agent wallet management and payments.

```bash
# Install
curl -L https://tempo.xyz/install | bash && tempo add wallet

# Use with Claude Code or any CLI agent
claude "Summarize https://stripe.com/docs using parallel.ai search via Tempo"
```

---

## Visa's Card Spec & SDK

Visa released a card-based MPP spec and SDK on March 18, 2026.

**What it does:** Enables card payments (Visa cards) directly within MPP flows, without requiring Stripe/SPTs as intermediary. Processor-agnostic — works with any acquirer (Cybersource, Adyen, Worldpay, etc.).

**Built on:** Visa Intelligent Commerce + Trusted Agent Protocol (agent identity/KYA verification).

**Key difference from Stripe SPTs:** SPTs route through Stripe regardless of merchant's processor. Visa's card spec routes through VisaNet directly. Merchant uses their existing acquirer relationship.

**Design partners:** Anthropic, DoorDash, Mastercard, Nubank, OpenAI, Ramp, Revolut, Shopify, Standard Chartered, Visa.

---

## Our Project: visa-mcp

An MCP (Model Context Protocol) server that enables AI agents to make payments via card rails and stablecoins.

### What it does
- Accepts card payments through Visa's card spec (tokenized via VGS, converted to network tokens + cryptograms)
- Accepts USDC payments on Base via EIP-3009 (`transferWithAuthorization`)
- Accepts payments via Tempo over MPP
- **Gateway mode:** Converts between rails (e.g., card in → USDC out, or USDC in → card out)
- Budget controls and audit trails for agent spending

### Card payment flow
1. Card collected → sent to VGS (vault) → returns agent-specific token
2. CVC alias expires after 20 minutes (PCI DSS requirement — CVV cannot be stored)
3. Agent-specific token used to bootstrap a **network token** (Visa Token Service)
4. Network token persists indefinitely (survives card reissue)
5. Per-transaction **cryptogram** generated for each charge (dynamic, one-time-use)
6. Network token + cryptogram submitted to acquirer → VisaNet → Issuer
7. Transaction settles through standard card rails

### Token hierarchy
| Credential | Scope | Lifetime | Purpose |
|-----------|-------|----------|---------|
| VGS token | Agent-specific | Permanent | Storage reference (vault pointer) |
| CVC alias | Agent-specific | 20 minutes | Bootstraps network token (PCI constraint) |
| Network token | Merchant/requestor-specific | Permanent (auto-updates on card reissue) | Substitute PAN for payments |
| Cryptogram | Transaction-specific | Single use | Proves authorization for this exact charge |

### Gateway concept
The gateway decouples consumer preference from merchant preference:

| In | Out | Description |
|----|-----|-------------|
| Card | Card | Standard Visa transaction |
| Card | USDC | Consumer uses card, merchant gets instant stablecoin settlement |
| USDC | Card | Agent pays stablecoin, merchant receives card-rail payment with dispute rights |
| USDC | USDC | Pure crypto flow |

---

## Key Concepts Glossary

**402 Payment Required** — HTTP status code used by MPP. Server returns this with payment instructions when a resource requires payment.

**SPT (Shared Payment Token)** — Stripe-proprietary token (prefix: `spt_`). Created by agent, consumed by merchant via Stripe PaymentIntent. Scoped by amount, merchant, and expiry. Single-use.

**Link** — Stripe's digital wallet. 200M+ consumers. Stores cards, bank accounts, BNPL. SPTs are minted from credentials saved in Link.

**Purl** — Stripe's MCP server for MPP. Agents discover and pay for services conversationally.

**Presto** — Stripe's CLI for MPP. Same capabilities as Purl, scriptable for cron jobs and non-AI automation.

**ACP (Agentic Commerce Protocol)** — Open standard by Stripe/OpenAI for structured commerce (product catalogs, checkout). Complements MPP (which handles payment mechanics).

**Network Token** — Visa Token Service credential. Substitute PAN scoped to a token requestor. Persists indefinitely, auto-updates on card reissue.

**Cryptogram** — Dynamic, transaction-specific proof generated from cryptographic keys. Bound to amount, merchant, and timestamp. Proves the token holder is authorized for this exact charge.

**KYA (Know Your Agent)** — Emerging framework for agent identity verification. Analogous to KYC for humans. Visa's Trusted Agent Protocol is one implementation.

**x402** — Coinbase/Cloudflare protocol for machine payments. Similar concept to MPP but blockchain-only (no card rail). MPP is designed to be compatible with x402.

**Tempo** — Payments-first blockchain incubated by Stripe and Paradigm. Settlement layer for MPP's stablecoin flows. Mainnet launched March 18, 2026.

---

## Useful Links

- **MPP spec:** https://github.com/anthropics/mpp (or check Tempo/Stripe repos)
- **Stripe MPP docs:** https://docs.stripe.com/payments/machine/mpp
- **Stripe charge intent IETF draft:** `draft-stripe-charge-00`
- **Visa card spec + SDK:** https://corporate.visa.com (search "card specification SDK machine payments protocol")
- **Tempo service directory:** https://tempo.xyz/services
- **Tempo CLI install:** `curl -L https://tempo.xyz/install | bash && tempo add wallet`
- **`mppx` npm package:** https://www.npmjs.com/package/mppx
- **Stripe blog announcement:** https://stripe.com/blog/machine-payments-protocol

---

## Architecture Notes for Building

### If you're building a service that accepts MPP payments:
1. Use `mppx/server` with the payment methods you want to accept
2. Return 402 with challenge on unpaid requests
3. Verify credential + process payment on retry
4. Return resource + receipt on success

### If you're building an agent that pays via MPP:
1. Fund a Tempo wallet (for USDC) or set up Stripe (for card/SPT)
2. Use `mppx/client` or the Tempo CLI
3. The client handles 402 → pay → retry automatically

### If you're building a proxy (reselling upstream APIs):
1. Get API keys for upstream services
2. Set up `mppx/server` with your pricing
3. On successful payment, call upstream with your key
4. Return upstream response with MPP receipt
5. Your margin = what you charge - what upstream charges you

### If you're building a gateway (rail conversion):
1. Accept payment on one rail (e.g., USDC via Tempo)
2. Convert and pay merchant on another rail (e.g., card via Visa)
3. Handle settlement timing differences (crypto is instant, cards are T+2)
4. Consider dispute/refund mechanics across rails
