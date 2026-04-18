# Talaria PRD: Cleetus Phase 1 — MCP Tool Interface + CLI

**Version:** 1.0
**Date:** April 16, 2026
**Scope:** Expose all four Talaria modules (Dashboard, Housing, Portfolio, Wallet) as MCP-compatible tools with a CLI entry point.

---

## 1. Overview

Phase 1 builds the foundational interface layer that every subsequent Cleetus phase depends on. Each Talaria module exposes its capabilities as structured tools that can be invoked programmatically — by Claude (via MCP), by a CLI, by the future voice pipeline, or by any external agent.

This phase produces no visible UI changes. It is pure infrastructure.

### Design Principles

- **One interface, many entry points.** The same tool handler serves MCP, CLI, HTTP API, and the future voice pipeline. Write once, call from anywhere.
- **Tools are read-heavy.** Most tools query data and return results. A few tools mutate state (log transaction, book reservation). Mutating tools always require explicit confirmation in interactive contexts.
- **Tools return structured JSON.** Every tool returns a consistent envelope: `{ success: boolean, data: any, message: string }`. The message is a human-readable summary suitable for TTS ("Your net worth is eight hundred forty-seven thousand, two hundred ninety-one dollars").
- **Tools are stateless.** Each call is independent. Context (like "the stock I just asked about") is handled by the calling agent (Claude), not by the tool layer.

---

## 2. Architecture

### 2.1 Tool Registry

A central registry where each module registers its tools at startup. Located at `src/lib/tools/registry.ts`.

```typescript
interface ToolDefinition {
  name: string;                    // e.g., "portfolio_get_net_worth"
  module: string;                  // e.g., "portfolio"
  description: string;             // Human-readable, used by Claude for tool selection
  parameters: JSONSchema;          // Input parameters schema
  handler: (params: any) => Promise<ToolResult>;
  category: 'query' | 'action';   // Actions mutate state, queries don't
}

interface ToolResult {
  success: boolean;
  data: any;
  message: string;                 // TTS-friendly summary
}
```

### 2.2 Module Tool Registration

Each module has a `tools.ts` file that exports its tool definitions:

```
src/
  modules/
    housing/
      tools.ts       ← Housing tool definitions
    portfolio/
      tools.ts       ← Portfolio tool definitions
    wallet/
      tools.ts       ← Wallet tool definitions
    dashboard/
      tools.ts       ← Dashboard tool definitions
  lib/
    tools/
      registry.ts    ← Central registry
      mcp-server.ts  ← MCP protocol adapter
      cli.ts         ← CLI entry point
      http.ts        ← HTTP API routes (/api/tools/*)
```

### 2.3 MCP Server

An MCP server that wraps the tool registry and exposes all tools via the Model Context Protocol. This runs as a local MCP server that Claude Code, the Claude app, or any MCP-compatible client can connect to.

Configuration in `.mcp.json` or `~/.claude.json`:
```json
{
  "mcpServers": {
    "talaria": {
      "command": "node",
      "args": ["src/lib/tools/mcp-server.ts"]
    }
  }
}
```

### 2.4 CLI

A `talaria` CLI command that invokes tools from the terminal.

```bash
# Installation: add bin entry to package.json
# Usage pattern: talaria <module> <action> [--param value]

talaria portfolio net-worth
talaria portfolio holdings --account Fidelity
talaria portfolio price AAPL
talaria housing rates
talaria housing listings --zip 78750 --max-price 500000
talaria wallet balance
talaria wallet balance --chain base
talaria dashboard summary
```

The CLI uses the same tool registry as MCP. It parses command-line arguments, maps them to tool parameters, calls the handler, and formats the result for terminal output (tables for structured data, plain text for simple values).

### 2.5 HTTP API

Next.js API routes that expose tools over HTTP for the voice pipeline and WebSocket sync (Phase 2).

```
POST /api/tools/invoke
Body: { tool: "portfolio_get_net_worth", params: {} }
Response: { success: true, data: { net_worth: 847291.44 }, message: "Your net worth is $847,291.44" }
```

---

## 3. Dashboard Module Tools

### 3.1 dashboard_get_summary

Returns a high-level summary of all modules.

**Parameters:** None

**Returns:**
```json
{
  "net_worth": 847291.44,
  "net_worth_change_today": 1243.18,
  "net_worth_change_pct": 0.15,
  "wallet_balance_tempo": 12.43,
  "wallet_balance_base": 3.20,
  "cost_today": 0.00,
  "cost_mtd": 1.47,
  "modules": ["housing", "portfolio", "wallet"]
}
```

**Message:** "Your net worth is $847,291, up $1,243 today. Tempo wallet has $12.43. You've spent $1.47 on API calls this month."

**CLI:** `talaria dashboard summary`

### 3.2 dashboard_navigate

Triggers navigation to a specific page. Returns the target path for WebSocket UI sync.

**Parameters:** `{ target: "housing" | "portfolio" | "wallet" | "cost" | "settings" | "home" }`

**Returns:** `{ path: "/housing" }`

**Message:** "Opening housing."

**CLI:** `talaria dashboard navigate housing`

---

## 4. Portfolio Module Tools

### 4.1 portfolio_get_net_worth

**Parameters:** None (or optional `{ as_of: "2026-04-16" }` for historical)

**Returns:**
```json
{
  "net_worth": 847291.44,
  "change_today_dollars": 1243.18,
  "change_today_pct": 0.15,
  "total_invested": 612400.00,
  "total_return_dollars": 234891.44,
  "total_return_pct": 38.35,
  "annualized_return_pct": 18.2,
  "cash_position": 84729.00
}
```

**Message:** "Your net worth is $847,291, up $1,243 today. Total return is $234,891 or 38.4%."

**CLI:** `talaria portfolio net-worth`

### 4.2 portfolio_get_holdings

**Parameters:**
- `account` (optional): filter to one account. String matching against account names.
- `asset_class` (optional): "stocks" | "crypto" | "cash" | "retirement" | "private" | "debt"
- `sort_by` (optional): "value" | "return" | "allocation" | "name". Default: "value"

**Returns:** Array of holdings, each with: ticker, name, account, quantity, price, market_value, cost_basis, return_dollars, return_pct, allocation_pct, asset_class

**Message:** Summarizes top 3 holdings by value and total count. "You have 18 positions. Largest: AAPL at $124,500, BTC at $96,318, VOO at $58,224."

**CLI:**
```bash
talaria portfolio holdings
talaria portfolio holdings --account Fidelity
talaria portfolio holdings --asset-class crypto
talaria portfolio holdings --sort-by return
```

### 4.3 portfolio_get_price

**Parameters:** `{ ticker: "AAPL" }` or `{ ticker: "BTC" }`

**Returns:** Current price, daily change, daily change %, high, low, open, previous close (from Finnhub for stocks, CoinGecko for crypto)

**Message:** "Apple is at $189.43, up 0.82% today."

**CLI:** `talaria portfolio price AAPL`

### 4.4 portfolio_get_allocation

**Parameters:** `{ view: "asset_class" | "platform" | "liquidity" | "tax_treatment" | "public_private" }`

**Returns:** Array of segments, each with: name, value, percentage

**Message:** Summarizes the top 3 segments. "By asset class: Stocks 45% at $381K, Crypto 22% at $186K, Cash 15% at $127K."

**CLI:** `talaria portfolio allocation --view platform`

### 4.5 portfolio_get_performance

**Parameters:**
- `scope`: "total" | "by_account" | "by_holding"
- `period` (optional): "1m" | "3m" | "6m" | "1y" | "ytd" | "all". Default: "ytd"

**Returns:** Array of entities with return_dollars, return_pct, annualized_pct

**Message:** For by_holding: "Best performers YTD: NVDA up 42%, BTC up 23%. Worst: XYZ down 12%."

**CLI:** `talaria portfolio performance --scope by_holding --period ytd`

### 4.6 portfolio_compare_benchmark

**Parameters:** `{ benchmarks: ["SPY", "BTC", "HYSA"], period: "1y" }`

**Returns:** For each benchmark: benchmark return % over period, portfolio return % over period, alpha (difference)

**Message:** "Over 1 year: your portfolio returned 18.4%. S&P 500 returned 14.2%. You're outperforming by 4.2 percentage points."

**CLI:** `talaria portfolio benchmark --vs SPY,BTC --period 1y`

### 4.7 portfolio_add_holding (action)

**Parameters:** `{ account: "Fidelity", ticker: "AAPL", quantity: 50, cost_per_unit: 148.00, purchase_date: "2023-03-15" }`

**Returns:** The created holding record with computed market value and return

**Message:** "Added 50 shares of AAPL to Fidelity. Current value $9,471.50, return +$2,071.50."

**CLI:** `talaria portfolio add --account Fidelity --ticker AAPL --qty 50 --cost 148 --date 2023-03-15`

### 4.8 portfolio_log_transaction (action)

**Parameters:**
```json
{
  "type": "buy" | "sell" | "swap" | "transfer" | "dividend",
  "account": "Fidelity",
  "ticker": "AAPL",
  "quantity": 10,
  "price": 195.50,
  "date": "2026-04-16",
  // For swaps:
  "to_ticker": "USDC",
  "to_quantity": 3200,
  // For transfers:
  "to_account": "Coinbase"
}
```

**Returns:** The transaction record, plus updated holding state and any realized gain/loss

**Message:** For sell: "Sold 10 AAPL from Fidelity at $195.50. Realized gain: $475 long-term."

**CLI:** `talaria portfolio sell --account Fidelity --ticker AAPL --qty 10 --price 195.50`

### 4.9 portfolio_get_tax_summary

**Parameters:** `{ year: 2026 }` (optional, defaults to current year)

**Returns:**
```json
{
  "unrealized_lt_gains": 142500,
  "unrealized_st_gains": 12401,
  "realized_gains_ytd": 5800,
  "realized_losses_ytd": 2100,
  "dividends_ytd": 2340,
  "interest_ytd": 890,
  "estimated_tax_liability": 2430,
  "harvestable_losses": [
    { "ticker": "XYZ", "unrealized_loss": -2800, "holding_period": "short-term" }
  ]
}
```

**Message:** "Year to date: $5,800 in realized gains, $2,100 in realized losses. Estimated tax liability $2,430. You have one harvestable loss: XYZ at negative $2,800."

**CLI:** `talaria portfolio tax --year 2026`

---

## 5. Housing Module Tools

### 5.1 housing_get_rates

Returns current mortgage rate data from the Bankrate scraper.

**Parameters:** `{ term: "30yr" | "15yr" | "arm" }` (optional, defaults to all)

**Returns:** Array of rates with lender, rate, APR, points, last_updated

**Message:** "Best 30-year fixed rate is 5.98% from Lender X. That's down 2 basis points from yesterday."

**CLI:** `talaria housing rates` or `talaria housing rates --term 30yr`

### 5.2 housing_get_fed_forecast

Returns Fed rate prediction data from Polymarket/Kalshi.

**Parameters:** None

**Returns:** Next meeting date, cut/hold/hike probabilities, historical accuracy

**Message:** "Next Fed meeting is May 7th. Markets see a 62% chance of a cut, 35% hold, 3% hike."

**CLI:** `talaria housing fed-forecast`

### 5.3 housing_get_listings

Returns property listings from RentCast, filtered by user preferences.

**Parameters:**
- `zip` (optional): specific zip code
- `min_price`, `max_price` (optional)
- `beds_min` (optional)
- `sort_by` (optional): "price" | "score" | "date"

**Returns:** Array of listings with address, price, beds, baths, sqft, deal_score, walkability, commute times

**Message:** Summarizes top 3 by deal score. "Found 12 listings in 78750. Best deal: 1234 Oak Lane at $425K, deal score 82."

**Note:** This tool triggers MPP costs (RentCast at ~$0.033/call). The tool result includes `cost_incurred: 0.033` in the response.

**CLI:** `talaria housing listings --zip 78750 --max-price 500000`

### 5.4 housing_get_neighborhoods

Returns neighborhood scoring data.

**Parameters:** `{ zip: "78750" }` (optional, returns all scored neighborhoods if omitted)

**Returns:** Array of neighborhoods with zip, name, overall_score, walkability, commute_score, price_score

**Message:** "Top neighborhoods: 78750 scores 84 overall, 78704 scores 81, 78745 scores 76."

**CLI:** `talaria housing neighborhoods` or `talaria housing neighborhoods --zip 78750`

### 5.5 housing_get_rate_sensitivity

Returns monthly payment calculations at various rate scenarios.

**Parameters:** `{ home_price: 450000, down_payment_pct: 20 }`

**Returns:** Monthly payments at current rate, ±0.25%, ±0.50%, plus Polymarket-weighted expected payment

**Message:** "At $450K with 20% down, your payment at today's 5.98% rate is $2,154 per month. If the Fed cuts, it drops to roughly $2,098."

**CLI:** `talaria housing sensitivity --price 450000 --down 20`

### 5.6 housing_navigate_map

Triggers navigation to the Housing map view, optionally centered on a specific zip or listing.

**Parameters:** `{ zip: "78750" }` or `{ listing_id: "abc123" }`

**Returns:** `{ path: "/housing", params: { focus_zip: "78750" } }`

**Message:** "Opening housing map centered on 78750."

**CLI:** `talaria housing map --zip 78750`

---

## 6. Wallet Module Tools

### 6.1 wallet_get_balance

Returns wallet balances across chains.

**Parameters:** `{ chain: "tempo" | "base" | "all" }` (optional, defaults to "all")

**Returns:**
```json
{
  "tempo": { "usdc_e": 12.43, "address": "0x..." },
  "base": { "usdc": 3.20, "eth": 0.008, "address": "0x..." },
  "total_usd": 15.63
}
```

**Message:** "Your wallet has $12.43 USDC on Tempo and $3.20 USDC on Base. Total $15.63."

**CLI:** `talaria wallet balance` or `talaria wallet balance --chain tempo`

### 6.2 wallet_get_spending

Returns spending data for cost analytics.

**Parameters:** `{ period: "today" | "week" | "month" | "all" }` (optional, defaults to "today")

**Returns:** Total spend, breakdown by service, breakdown by module

**Message:** "You've spent $0.47 today across 14 API calls. Largest: RentCast at $0.33."

**CLI:** `talaria wallet spending --period month`

### 6.3 wallet_get_deposit_address

Returns the wallet address for receiving funds.

**Parameters:** `{ chain: "tempo" | "base" }`

**Returns:** `{ address: "0x...", chain: "base", supported_tokens: ["USDC", "ETH"] }`

**Message:** "Your Base deposit address is 0x... Send USDC or ETH on Base to this address."

**CLI:** `talaria wallet address --chain base`

### 6.4 wallet_bridge_funds (action)

Initiates a bridge from Base USDC to Tempo USDC.e via Bungee API.

**Parameters:** `{ amount: 10.00, from_chain: "base", to_chain: "tempo" }`

**Returns:** Transaction hash, estimated completion time, bridge fee

**Message:** "Bridging $10 USDC from Base to Tempo. Estimated completion: 30 seconds. Bridge fee: $0.02."

**Note:** This is a mutating action that requires gas (Base ETH). The tool checks for sufficient balance before executing.

**CLI:** `talaria wallet bridge --amount 10 --from base --to tempo`

---

## 7. CLI Implementation Details

### 7.1 Command Structure

```
talaria <module> <action> [--param value] [--format json|table|text]
```

- Default output format is `text` (human-readable, TTS-friendly)
- `--format json` returns raw tool result for scripting
- `--format table` renders structured data as ASCII tables

### 7.2 Help System

```bash
talaria --help                    # List all modules
talaria portfolio --help          # List portfolio tools
talaria portfolio holdings --help # Show parameters for this tool
```

### 7.3 Package.json Entry

```json
{
  "bin": {
    "talaria": "./src/lib/tools/cli.ts"
  }
}
```

Installed globally via `npm link` during development.

### 7.4 Error Handling

- Network errors return `{ success: false, message: "Failed to reach Finnhub API" }`
- Validation errors return `{ success: false, message: "Unknown account: Schwab. Available: Fidelity, Coinbase, ..." }`
- CLI displays errors in red, exits with code 1

---

## 8. Build Order

1. **Tool registry** (`registry.ts`) — define ToolDefinition interface, registry class with register/invoke methods
2. **Dashboard tools** — `dashboard_get_summary`, `dashboard_navigate` (simplest module, validates the pattern)
3. **Portfolio tools** — all 9 tools. These depend on the portfolio data model being at least partially built
4. **Housing tools** — all 6 tools. These wrap existing housing module data access
5. **Wallet tools** — all 4 tools. These wrap existing wallet balance/transaction queries
6. **CLI adapter** (`cli.ts`) — parse arguments, map to tools, format output
7. **HTTP API routes** (`/api/tools/invoke`) — thin wrapper for WebSocket integration in Phase 2
8. **MCP server adapter** (`mcp-server.ts`) — wraps registry in MCP protocol format

---

## 9. Dependencies

- `@modelcontextprotocol/sdk` — MCP server SDK
- `commander` or `yargs` — CLI argument parsing
- `cli-table3` — ASCII table output for CLI
- No new runtime dependencies for the tool registry itself — it's pure TypeScript

---

## 10. Testing

Each tool should have a corresponding test that:
1. Calls the handler with valid parameters and asserts the response shape
2. Calls the handler with invalid parameters and asserts the error response
3. Verifies the `message` field is a coherent English sentence (for TTS quality)

Tests live at `src/modules/<module>/__tests__/tools.test.ts`.
