# MPP Payment Intents — Critical Reference

## Intent Types

### `charge` (safe — one-time payment)
- Single payment per request
- You pay once, get one response
- Total cost is known upfront from the 402 challenge `amount` field
- **Use these for Talaria**

### `session` (DANGEROUS — streaming/recurring payment)
- Opens a payment channel
- Deposits funds into an escrow contract
- The server can charge you repeatedly within the session
- Charges may continue as long as the session is active
- Total cost is NOT known upfront — depends on how many requests the server bills
- Has an `escrowContract` field in the decoded request
- Has `unitType: "request"` meaning it charges per request within the session
- **DO NOT use these without understanding the exact billing cadence and session termination**

## Known Endpoints by Intent Type

| Endpoint | Intent | Cost | Safe? |
|----------|--------|------|-------|
| RentCast (via Locus) | `charge` | $0.033/req | YES |
| Mapbox Geocode (via Locus) | `charge` | $0.00375/req | YES |
| Mapbox Isochrone (via Locus) | `charge` | $0.005/req | YES |
| Alchemy (tempo method) | `charge` | $0.001/req | YES |
| Alchemy (stripe method) | `charge` | varies | YES |
| **Tempo RPC** | **`session`** | **$0.001/req BUT STREAMING** | **NO** |

## How to Identify

Look at the `intent` field in the `WWW-Authenticate` header:
```
WWW-Authenticate: Payment id="...", method="tempo", intent="session", ...
                                                     ^^^^^^^^^^^^^^^^
```

If `intent="session"`, DO NOT proceed without understanding the billing model.

If `intent="charge"`, it's safe — one payment, one response.

## Cheapest Safe Option for Testing

**Mapbox Geocode via Locus** at $0.00375 per request.
- Endpoint: `https://mapbox.mpp.paywithlocus.com/mapbox/geocode-forward`
- Method: POST
- Body: `{"q": "Austin, TX"}`
- Intent: `charge`
- Payment: USDC.e on Tempo (chainId 4217)
