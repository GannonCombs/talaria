# MPP Endpoint Catalog

Last verified: 2026-04-06

## Locus-Proxied Services (Tempo USDC.e only)

All Locus endpoints accept only `method=tempo` on chain 4217 (Tempo mainnet).
Token: USDC.e at `0x20C000000000000000000000b9537d11c60E8b50`

### RentCast (`rentcast.mpp.paywithlocus.com`)
| Endpoint | Intent | Cost | Description |
|----------|--------|------|-------------|
| `/rentcast/markets` | charge | $0.033 | Market statistics by zip |
| `/rentcast/sale-listings` | charge | $0.033 | Sale listings by zip |
| `/rentcast/properties` | charge | $0.033 | Property records |
| `/rentcast/property-by-id` | charge | $0.033 | Property by ID |
| `/rentcast/value-estimate` | charge | $0.033 | AVM valuation |
| `/rentcast/rent-estimate` | charge | $0.033 | Rent estimate |
| `/rentcast/rental-listings` | charge | $0.033 | Rental listings |
| `/rentcast/rental-listing-by-id` | charge | $0.033 | Rental listing by ID |
| `/rentcast/random-properties` | charge | $0.033 | Random properties |

### Mapbox (`mapbox.mpp.paywithlocus.com`)
| Endpoint | Intent | Cost | Description |
|----------|--------|------|-------------|
| `/mapbox/geocode-forward` | charge | $0.0037 | Forward geocode |
| `/mapbox/geocode-reverse` | charge | $0.0037 | Reverse geocode |
| `/mapbox/directions` | charge | $0.005 | Directions |
| `/mapbox/matrix` | charge | $0.002/element | Matrix |
| `/mapbox/isochrone` | charge | $0.005 | Isochrone |
| `/mapbox/map-matching` | charge | $0.005 | Map matching |
| `/mapbox/static-image` | charge | $0.004 | Static image |
| `/mapbox/tilequery` | charge | $0.005 | Tilequery |

## Multi-Method Services

### Alchemy (`mpp.alchemy.com`)
| Endpoint | Methods | Intent | Cost |
|----------|---------|--------|------|
| `/:network/v2` | tempo, stripe | charge | $0.0001 |
| `/:network/nft/v3/:endpoint` (GET) | tempo, stripe | charge | $0.0005 |
| `/:network/nft/v3/:endpoint` (POST) | tempo, stripe | charge | $0.0005 |

Tempo method: USDC.e on chain 4217
Stripe method: card payment

## Session-Based (STREAMING — USE WITH CAUTION)

### Tempo RPC (`rpc.mpp.tempo.xyz`)
| Endpoint | Method | Intent | Cost |
|----------|--------|--------|------|
| `/` (JSON-RPC) | tempo | **session** | $0.001/request within session |

**WARNING**: Session intent means streaming/recurring charges. Uses escrow contract. Do not use without understanding billing cadence.

## x402 Protocol Services (via AgentCash)

### Allium (`agents.allium.so`)
| Endpoint | Networks | Cost |
|----------|----------|------|
| `/api/v1/developer/prices` | Base USDC, Solana USDC | $0.02 |
| `/api/v1/developer/wallet/balances` | Base USDC, Solana USDC | $0.03 |
| `/api/v1/developer/wallet/transactions` | Base USDC, Solana USDC | $0.03 |

Uses x402 v2 protocol (not standard MPP WWW-Authenticate).

## Free Services (no payment required)
| Service | What | Notes |
|---------|------|-------|
| Bankrate API | Mortgage rates | Direct JSON API, free |
| Polymarket Gamma API | Fed predictions | Free, public |
| Zillow ZHVI CSV | Price history | Free download |
| Nominatim | Geocoding | Free, rate-limited |
| Valhalla | Isochrones | Free, no API key |
| FEMA NFHL | Flood zones | Free GeoJSON |
| Census TIGER | Tract boundaries | Free GeoJSON |

## Payment Summary for Talaria Housing

Assuming daily use with caching:
- RentCast listings (5 zips × $0.033): $0.165 (cached 24hr)
- RentCast AVM (5 listings × $0.033): $0.165 (cached 30 days)
- Mapbox geocode: $0 (using free Nominatim)
- Mapbox isochrone: $0 (using free Valhalla)
- Everything else: $0 (free APIs)
- **Daily cost: ~$0.33** (much less with caching)
