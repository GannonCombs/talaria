# Talaria PRD: Cleetus Phase 3 — Claude Voice + MCP Integration

**Version:** 1.0
**Date:** April 16, 2026
**Scope:** Use Claude's native voice capability (via the Claude app) with Talaria's MCP tools as a zero-cost voice controller. Validate whether voice control is useful before investing in custom infrastructure.
**Depends on:** Phase 1 (MCP Tools), Phase 2 (WebSocket UI Sync)

---

## 1. Overview

With Phase 1 and 2 complete, Talaria's modules are fully addressable via MCP, and the UI updates in real time when tools are invoked. This phase connects Claude's voice feature to those tools — giving you voice control of Talaria for free, using your existing Claude subscription.

This phase requires minimal new code. The work is primarily configuration and prompt engineering.

---

## 2. How It Works

### 2.1 User Flow

1. Open the Claude app (desktop, mobile, or web) with voice mode
2. Say: "Check my net worth on Talaria"
3. Claude recognizes the intent, calls the `portfolio_get_net_worth` MCP tool
4. Talaria executes the query, returns the result
5. Claude speaks: "Your net worth is $847,291, up $1,243 today"
6. Simultaneously, Talaria's browser UI shows the Cleetus indicator flash amber, a toast appears with the result, and the portfolio data refreshes if you're on that page

### 2.2 No Custom Voice Pipeline Needed

Claude handles all of the following natively:
- Wake word / activation (whatever Claude's voice activation is)
- Speech-to-text transcription
- Natural language understanding and intent parsing
- Multi-turn conversation ("What about just crypto?" as a follow-up)
- Text-to-speech response

Talaria handles:
- Tool execution (the actual data queries and actions)
- UI synchronization (WebSocket events from Phase 2)

---

## 3. MCP Server Configuration

### 3.1 Claude App MCP Setup

The Talaria MCP server (built in Phase 1) needs to be configured in Claude's MCP settings. The exact configuration depends on which Claude client is used:

**Claude Desktop App:**
Add to Claude's MCP configuration (typically `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "talaria": {
      "command": "node",
      "args": ["/path/to/talaria/src/lib/tools/mcp-server.js"],
      "env": {
        "TALARIA_DB_PATH": "/path/to/talaria/data/talaria.db",
        "TALARIA_WS_PORT": "3001"
      }
    }
  }
}
```

**Claude Code:**
Add to project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "talaria": {
      "command": "node",
      "args": ["src/lib/tools/mcp-server.js"]
    }
  }
}
```

### 3.2 Tool Descriptions for Claude

The tool descriptions from Phase 1 are critical here — Claude uses them to decide which tool to call. They should be written as natural language that matches how a user would phrase a request.

Good description: "Get the user's total net worth across all accounts, including daily change. Call this when the user asks about their net worth, total portfolio value, or how much they're worth."

Bad description: "Returns net_worth, change_today_dollars, change_today_pct from the portfolio aggregate table."

Review all tool descriptions from Phase 1 and ensure they include common phrasings a voice user would say.

### 3.3 System Prompt Context (if configurable)

If Claude allows system prompt customization for MCP tool usage, provide context:

"Talaria is the user's personal financial dashboard. It tracks their investment portfolio across 8 accounts (Fidelity, Coinbase, Kraken, Binance, Wells Fargo, Merrill Lynch, EquityZen, Augment.Markets), monitors housing market data for home buying, and manages a crypto wallet for API micropayments. When the user asks about their finances, portfolio, net worth, holdings, housing, mortgage rates, or wallet balance, use the appropriate Talaria tool. Keep responses concise and speak dollar amounts naturally (say 'eight hundred forty-seven thousand' not 'eight four seven two nine one')."

---

## 4. Voice Interaction Patterns

### 4.1 Simple Queries (single tool call)

| User says | Tool called | Claude speaks |
|-----------|------------|---------------|
| "What's my net worth?" | portfolio_get_net_worth | "Your net worth is $847,291, up $1,243 today." |
| "How's my crypto doing?" | portfolio_get_holdings (asset_class: crypto) | "Your crypto is worth $196K. BTC at $96K, ETH at $44K..." |
| "What's Bitcoin at?" | portfolio_get_price (ticker: BTC) | "Bitcoin is at $64,212, down 2.1% today." |
| "Show me housing" | dashboard_navigate (target: housing) | "Opening housing." |
| "What's my wallet balance?" | wallet_get_balance | "You have $12.43 on Tempo and $3.20 on Base." |
| "What are mortgage rates?" | housing_get_rates | "Best 30-year fixed is 5.98%, down 2 basis points." |

### 4.2 Multi-Turn Conversations

Claude maintains conversation context across turns, enabling follow-ups:

- "What's my net worth?" → portfolio_get_net_worth
- "How is it allocated?" → portfolio_get_allocation (view: asset_class)
- "What about by account?" → portfolio_get_allocation (view: platform)
- "Am I beating the S&P?" → portfolio_compare_benchmark (benchmarks: [SPY])

### 4.3 Complex Queries (multi-tool calls)

Some questions require Claude to call multiple tools and synthesize:

- "Give me a financial summary" → dashboard_get_summary + portfolio_get_allocation + housing_get_rates
- "Should I sell my BTC?" → portfolio_get_holdings (ticker: BTC) + portfolio_get_tax_summary + portfolio_compare_benchmark (benchmarks: [BTC])
- "What's happening with rates and how does it affect my home search?" → housing_get_rates + housing_get_fed_forecast + housing_get_rate_sensitivity

### 4.4 Action Commands

Actions that mutate state require confirmation from Claude:

- "Log a buy of 10 Apple at 195" → Claude confirms: "I'll add 10 shares of AAPL at $195 to your portfolio. Which account?" → User: "Fidelity" → portfolio_log_transaction
- "Bridge 10 USDC to Tempo" → Claude confirms: "I'll bridge $10 USDC from Base to Tempo. This will cost a small gas fee. Go ahead?" → User: "Yes" → wallet_bridge_funds

---

## 5. UI Behavior During Voice Sessions

When tools are called via Claude MCP, the Phase 2 WebSocket infrastructure handles all UI updates:

- Cleetus indicator pulses amber while a tool is executing
- Toast notifications show results
- If a navigate tool is called, the browser changes pages
- If a data query runs while the user is viewing that module, the data refreshes in place

No additional UI work is needed in this phase — Phase 2 handles it all.

---

## 6. Fitness and Food Voice Patterns (Preview)

These modules don't exist yet, but the MCP tool pattern supports them. When they're built, voice interactions will work the same way:

### Fitness (future module)
- "Log my workout. Bench press, 4 sets: 10 at 185, 8 at 195, 6 at 205, 4 at 215. Then 25 minutes on the bike."
- Claude parses this into structured data and calls `fitness_log_workout`
- The tool stores the structured exercise data in SQLite

### Food / Reservations (future module)
- "Book me a table at Uchi for two on Saturday around 7"
- Claude calls `food_book_reservation` with parsed parameters
- Tool hits Resy API, finds availability, books the closest slot
- Claude speaks: "Booked. Uchi, Saturday 7:15 PM, party of two."

### Smart Queries (future, requires Claude reasoning)
- "I need a date night restaurant tonight, something nice, whatever's available"
- Claude calls `food_search_restaurants` with filters (cuisine: upscale, date: today, party: 2)
- Gets multiple options back, evaluates availability
- "I found three options tonight. Emmer & Rye has a 7:30, Uchi has a bar seat at 8, and Uchiko has a 9 PM. Want me to book one?"

---

## 7. Limitations of This Approach

**No always-on listening.** You must open the Claude app and initiate voice mode. This is "pull out phone and talk" (like Siri), not "shout from the kitchen" (like Alexa).

**No custom wake word.** You can't say "Cleetus" to activate Claude. You use whatever activation Claude provides.

**Latency is higher.** Claude voice → MCP → Talaria → response → Claude TTS is slower than a local pipeline would be. Expect 3-5 seconds for a complete round-trip vs. 1-2 seconds for a local Whisper + keyword matcher.

**Dependent on internet.** Claude voice requires an internet connection. A local pipeline (Phase 4) would work offline for cached data queries.

**No custom TTS voice.** Claude speaks in Claude's voice, not a custom "Cleetus" voice.

These limitations are acceptable for validation. If voice control proves valuable in daily use, Phase 4 addresses all of them.

---

## 8. Build Order

1. **Configure MCP server** in Claude Desktop App settings
2. **Review and polish tool descriptions** for natural language matching
3. **Test each tool** via Claude voice — verify tool selection, parameter parsing, and response quality
4. **Iterate on tool descriptions** based on Claude's tool selection accuracy
5. **Test multi-turn conversations** — verify context carries across turns
6. **Test action commands** — verify confirmation flow and state mutation
7. **Document common voice commands** as a quick reference for personal use

---

## 9. Success Criteria

This phase is a validation experiment. Success means:

- You use voice control at least 3x per day for a week
- Tool selection accuracy is >90% (Claude picks the right tool for your query)
- Response latency is acceptable (<5 seconds for most queries)
- UI sync works reliably (browser updates when tools are called)

If these criteria aren't met, investigate why before proceeding to Phase 4. If voice control isn't naturally useful, the custom pipeline isn't worth building.

If they are met, Phase 4 adds the always-on ambient experience with custom wake word, lower latency, and offline capability.
