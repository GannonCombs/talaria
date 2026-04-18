# Talaria PRD: Cleetus Phase 2 — WebSocket UI Sync + Cleetus Indicator

**Version:** 1.0
**Date:** April 16, 2026
**Scope:** Real-time UI synchronization when tools are invoked externally, plus the Cleetus on-air indicator in the top bar.
**Depends on:** Phase 1 (MCP Tool Interface)

---

## 1. Overview

When a tool is invoked from any external source — Claude voice via MCP, the CLI, or the future voice pipeline — the Talaria frontend should reflect the action in real time. This phase adds a WebSocket connection between the Next.js backend and the browser, a UI event broadcast system, and the Cleetus on-air indicator.

---

## 2. WebSocket Infrastructure

### 2.1 Server-Side

A WebSocket server runs alongside the Next.js development server. In production (local desktop app), this runs on a secondary port (e.g., `localhost:3001`) or as a WebSocket upgrade on the main server.

**Technology:** `ws` npm package (lightweight, no Socket.IO overhead needed for a single-client local app).

**Event format:**

```typescript
interface UIEvent {
  type: 'navigate' | 'data_update' | 'toast' | 'cleetus_state';
  payload: any;
  timestamp: number;
  source: 'mcp' | 'cli' | 'voice' | 'internal';
  tool_name?: string;        // e.g., "portfolio_get_net_worth"
  tool_message?: string;     // TTS-friendly message from tool result
}
```

### 2.2 Client-Side

A React context provider (`CleetusProvider`) wraps the app and manages:
- WebSocket connection lifecycle (connect on mount, reconnect on disconnect)
- Event dispatch to the appropriate handler
- Cleetus state (idle/active)
- Command log (last 15 commands)

```typescript
// src/providers/CleetusProvider.tsx
interface CleetusState {
  status: 'idle' | 'active';
  lastCommand: string | null;
  lastResponse: string | null;
  commandLog: CommandLogEntry[];
}
```

### 2.3 Event Flow

1. External source calls a tool (e.g., `talaria portfolio net-worth` from CLI)
2. Tool registry executes the handler
3. After execution, registry broadcasts a UIEvent via WebSocket:
   - For `dashboard_navigate`: `{ type: 'navigate', payload: { path: '/housing' } }`
   - For data queries: `{ type: 'data_update', payload: { module: 'portfolio', tool: 'get_net_worth', data: {...} } }`
   - For actions: `{ type: 'toast', payload: { message: 'Added 50 AAPL to Fidelity', variant: 'success' } }`
4. Before execution: broadcast `{ type: 'cleetus_state', payload: { status: 'active', tool: 'portfolio_get_net_worth' } }`
5. After execution: broadcast `{ type: 'cleetus_state', payload: { status: 'idle' } }`

### 2.4 Navigation Handling

When a `navigate` event is received, the frontend uses Next.js router to navigate:

```typescript
// In CleetusProvider
useEffect(() => {
  ws.onmessage = (event) => {
    const uiEvent = JSON.parse(event.data);
    switch (uiEvent.type) {
      case 'navigate':
        router.push(uiEvent.payload.path);
        break;
      case 'data_update':
        // Trigger SWR/React Query revalidation for the affected module
        mutate(uiEvent.payload.module);
        break;
      case 'toast':
        showToast(uiEvent.payload.message, uiEvent.payload.variant);
        break;
      case 'cleetus_state':
        setCleetusStatus(uiEvent.payload.status);
        break;
    }
  };
}, []);
```

---

## 3. Cleetus On-Air Indicator

### 3.1 Placement

In the top bar, immediately to the right of the "TALARIA" wordmark. Left of all other top-bar elements (wallet pill, cost pill, settings gear).

### 3.2 Visual States

**Idle:** A small circle (10-12px diameter), filled with muted gray (#484F58). No animation. Blends quietly into the top bar. Optionally shows a tiny mic icon inside the circle instead of a solid fill.

**Active:** The circle fills with amber (#F5A623) and gently pulses — a slow opacity oscillation between 80% and 100%, cycling over ~2 seconds. The pulse is subtle, not frantic. Think "breathing," not "alarm."

### 3.3 Click Behavior

Clicking the Cleetus indicator opens a dropdown panel. The panel is ~320px wide, anchored to the indicator, and drops down below the top bar.

**Panel contents:**

**Header row:**
- "Cleetus" label in Inter semibold
- Status badge: "Idle" (gray pill) or "Active" (amber pill)
- On/Off toggle switch on the right (toggles whether Porcupine is running, for Phase 4; for now, toggles whether external tool calls update the UI)

**Last command section** (only visible if there's been at least one command):
- "Last command" label in small muted Inter
- The command text in JetBrains Mono, 12px: "portfolio net-worth"
- "Response" label below
- The response message in Inter, 13px: "Your net worth is $847,291, up $1,243 today."
- Timestamp in muted text: "12 seconds ago"

**Command log:**
- "Recent" label with a small divider
- Scrollable list of last 10-15 commands, each showing:
  - Tool name in JetBrains Mono (small): "housing_get_rates"
  - Source badge: "MCP" (teal pill) or "CLI" (gray pill) or "Voice" (amber pill)
  - Timestamp: "2 min ago"
- Clicking a log entry expands it to show the full response message

**Panel styling:**
- Background: #161B22
- Border: 1px solid #30363D
- Border-radius: 8px
- Box-shadow: subtle drop shadow for elevation (exception to the general no-shadow rule — dropdowns need elevation)
- Appears with a quick fade-in (150ms)
- Clicking outside the panel closes it

### 3.4 Toast Notifications

When a tool is invoked externally and produces a result, a small toast notification appears in the bottom-right of the viewport:

- Background: #161B22, border: 1px solid #30363D
- Amber left border (3px solid #F5A623)
- Shows: "Cleetus: [tool message]" — e.g., "Cleetus: Your net worth is $847,291."
- Auto-dismisses after 4 seconds
- Stacks if multiple toasts arrive in quick succession (max 3 visible)
- Only appears for externally-invoked tools, not for actions initiated from the UI itself

---

## 4. Tool Registry Integration

### 4.1 Broadcast Hook

The tool registry's `invoke` method is modified to broadcast UIEvents before and after execution:

```typescript
async invoke(toolName: string, params: any, source: Source): Promise<ToolResult> {
  // Broadcast active state
  this.broadcast({
    type: 'cleetus_state',
    payload: { status: 'active', tool: toolName },
    source
  });

  try {
    const result = await this.tools[toolName].handler(params);

    // Broadcast result
    if (this.tools[toolName].category === 'action') {
      this.broadcast({ type: 'toast', payload: { message: result.message, variant: 'success' }, source });
    }

    // Broadcast data update for UI refresh
    this.broadcast({
      type: 'data_update',
      payload: { module: this.tools[toolName].module, tool: toolName, data: result.data },
      source
    });

    // Log the command
    this.addToLog({ tool: toolName, params, result, source, timestamp: Date.now() });

    return result;
  } finally {
    // Always return to idle
    this.broadcast({ type: 'cleetus_state', payload: { status: 'idle' }, source });
  }
}
```

### 4.2 Navigation Tool Special Handling

The `dashboard_navigate` tool broadcasts a `navigate` event instead of `data_update`:

```typescript
// In dashboard tools.ts
handler: async (params) => {
  const pathMap = {
    home: '/',
    housing: '/housing',
    portfolio: '/portfolio',
    wallet: '/wallet',
    cost: '/cost-analytics',
    settings: '/settings'
  };
  return {
    success: true,
    data: { path: pathMap[params.target] },
    message: `Opening ${params.target}.`,
    _uiEvent: { type: 'navigate', payload: { path: pathMap[params.target] } }
  };
}
```

The registry checks for `_uiEvent` in the result and broadcasts it instead of the default `data_update`.

---

## 5. Command Log Persistence

The command log persists across page reloads using the existing SQLite database.

### 5.1 Schema

```sql
CREATE TABLE cleetus_command_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_name TEXT NOT NULL,
  params TEXT,                    -- JSON string
  result_message TEXT,
  source TEXT NOT NULL,           -- 'mcp' | 'cli' | 'voice'
  success BOOLEAN NOT NULL,
  timestamp INTEGER NOT NULL
);
```

### 5.2 Retention

Keep the last 100 commands. On each insert, delete rows beyond 100 (oldest first).

---

## 6. Build Order

1. **WebSocket server** — basic ws server on port 3001, accepts connections, broadcasts messages
2. **CleetusProvider** — React context with WebSocket client, state management, event dispatch
3. **Cleetus indicator** — the amber dot in the top bar, click-to-open panel
4. **Toast component** — bottom-right notification toasts
5. **Tool registry broadcast hook** — modify invoke() to emit UIEvents
6. **Navigation handler** — wire navigate events to Next.js router
7. **Data update handler** — wire data_update events to SWR/React Query revalidation
8. **Command log** — SQLite table, write on each tool invocation, read in Cleetus panel

---

## 7. Dependencies

- `ws` — WebSocket server
- No new client-side dependencies (native WebSocket API in browsers)

---

## 8. Testing

1. Start Talaria in the browser
2. Run `talaria dashboard navigate housing` from the terminal
3. Verify: browser navigates to /housing, Cleetus dot flashes amber during execution, toast appears with "Opening housing", command appears in Cleetus panel log
4. Run `talaria portfolio net-worth` from the terminal
5. Verify: toast shows net worth message, Cleetus panel shows the command and response
