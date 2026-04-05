# Talaria Shell — Product Requirements Document

## Overview

Talaria is a local desktop web application that serves as a personal financial intelligence dashboard. The Shell is the foundational layer: navigation, layout, cost tracking, wallet display, database, and the module architecture that allows individual tools (Housing, Portfolio, Food) to plug in as self-contained sub-applications.

This PRD covers everything except the individual modules themselves.

**Visual Reference:** Use the exported Stitch mockups (Dashboard Overview, Housing Tool, Cost Analytics, Wallet) as the visual target. The mockups define layout, color palette, typography, spacing, and component patterns. This PRD defines behavior, data flow, and technical implementation.

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Database:** SQLite via better-sqlite3 (single file, local, zero-config)
- **Styling:** Tailwind CSS with custom design tokens
- **Charts:** Recharts
- **Icons:** Lucide React
- **Fonts:** Inter (Google Fonts) + JetBrains Mono (Google Fonts)
- **State Management:** React Context + hooks (no Redux — app is simple enough)
- **MPP Client:** Tempo CLI / direct HTTP with Payment header (details in Housing PRD)

---

## Project Structure

```
talaria/
├── app/
│   ├── layout.tsx              # Root layout: top bar + sidebar + main content area
│   ├── page.tsx                # Dashboard (home)
│   ├── housing/
│   │   └── page.tsx            # Housing module (full view)
│   ├── cost-analytics/
│   │   └── page.tsx            # Cost analytics (full view)
│   ├── wallet/
│   │   └── page.tsx            # Wallet management (full view)
│   └── settings/
│       └── page.tsx            # Settings (full view)
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx          # TALARIA wordmark + wallet/cost pills
│   │   ├── Sidebar.tsx         # Icon-only sidebar (3 items + settings)
│   │   └── BackButton.tsx      # Back arrow for module/utility views
│   ├── dashboard/
│   │   ├── ModuleCard.tsx      # Summary card for a module
│   │   ├── AddModuleCard.tsx   # Dashed placeholder card
│   │   └── TransactionTable.tsx # Recent transactions table
│   ├── cost-analytics/
│   │   ├── SpendChart.tsx      # Daily spend area chart
│   │   ├── ServiceDonut.tsx    # Spend by service donut
│   │   ├── InsightCards.tsx    # Bottom insight row
│   │   └── FullTransactionTable.tsx
│   ├── wallet/
│   │   ├── WalletCard.tsx      # Balance display + health bar
│   │   ├── FundingChannels.tsx # Coinbase / Exchange / Bridge options
│   │   ├── RecentActivity.tsx  # Wallet-specific transaction list
│   │   ├── PaymentMethods.tsx  # Tempo active + Card coming soon
│   │   └── SpendingControls.tsx # Toggles for limits and alerts
│   ├── shared/
│   │   ├── StatCard.tsx        # Compact metric card (label + value)
│   │   ├── RailIcon.tsx        # Tempo diamond or card icon
│   │   └── MonoNumber.tsx      # JetBrains Mono formatted number
│   └── modules/               # Module-specific components go in subdirectories
│       └── housing/            # (defined in Housing PRD)
├── lib/
│   ├── db.ts                   # SQLite connection + migrations
│   ├── schema.ts               # Table definitions + migration SQL
│   ├── mpp.ts                  # MPP transaction logger + cost tracker
│   ├── wallet.ts               # Wallet balance reader
│   └── modules.ts              # Module registry
├── hooks/
│   ├── useCostTracker.ts       # Hook for reading/subscribing to cost data
│   ├── useWallet.ts            # Hook for wallet balance state
│   └── useModuleRegistry.ts    # Hook for registered modules
├── styles/
│   └── tokens.ts               # Design token constants
├── talaria.db                  # SQLite database file (gitignored)
└── package.json
```

---

## Design Tokens

```typescript
// styles/tokens.ts

export const colors = {
  bgPrimary: '#0D1117',
  bgCard: '#161B22',
  bgElevated: '#1C2128',
  bgSidebar: '#0A0E13',
  borderSubtle: '#30363D',
  borderActive: '#00D4AA',
  textPrimary: '#E6EDF3',
  textSecondary: '#8B949E',
  textMuted: '#484F58',
  accentTeal: '#00D4AA',
  accentAmber: '#F5A623',
  positive: '#3FB950',
  negative: '#E5534B',
  chartPrimary: '#00D4AA',
  chartSecondary: '#8B949E',
} as const;

export const fonts = {
  ui: '"Inter", sans-serif',
  mono: '"JetBrains Mono", monospace',
} as const;
```

Map these to Tailwind in `tailwind.config.ts` as custom theme extensions.

---

## Database Schema

All tables live in a single SQLite file (`talaria.db`). The database is created on first launch via migrations in `lib/schema.ts`.

### Core Tables (Shell-owned)

```sql
-- Every MPP API call made by any module
CREATE TABLE mpp_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  service TEXT NOT NULL,          -- 'RentCast', 'Polymarket', 'Mapbox', etc.
  module TEXT NOT NULL,           -- 'housing', 'portfolio', 'food'
  endpoint TEXT,                  -- '/v1/properties', '/markets/fed', etc.
  rail TEXT NOT NULL DEFAULT 'tempo',  -- 'tempo' or 'card'
  cost_usd REAL NOT NULL,        -- cost in USD (e.g., 0.03)
  request_hash TEXT,             -- optional dedup key
  metadata TEXT                  -- JSON blob for module-specific context
);

CREATE INDEX idx_transactions_timestamp ON mpp_transactions(timestamp);
CREATE INDEX idx_transactions_module ON mpp_transactions(module);
CREATE INDEX idx_transactions_service ON mpp_transactions(service);

-- User preferences (key-value store for settings)
CREATE TABLE user_preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,            -- JSON-encoded value
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Module registry (tracks installed modules and their state)
CREATE TABLE modules (
  id TEXT PRIMARY KEY,            -- 'housing', 'portfolio', 'food'
  name TEXT NOT NULL,             -- 'Housing', 'Portfolio', 'Food'
  enabled INTEGER NOT NULL DEFAULT 1,
  last_refreshed TEXT,            -- last time module data was fetched
  metadata TEXT                   -- JSON blob for module-specific config
);
```

### Default Preferences

On first launch, seed `user_preferences` with:

```
city                → null (set during onboarding)
state               → null (set during onboarding)
budget              → 550000
down_payment_pct    → 20
loan_term_years     → 30
credit_score_tier   → "excellent"
daily_spend_limit   → null (disabled)
low_balance_alert   → 2.00
auto_pause_empty    → true
```

Module-specific preferences (like target zip codes, scoring weights, work commute address) are stored as module-prefixed keys (e.g., `housing.target_zips`, `housing.scoring_weights`, `housing.work_address`). This keeps the global profile clean while allowing each module to own its own config.

### First-Launch Onboarding

On first launch (when `city` is null), show a minimal onboarding overlay — not a multi-step wizard, just a single card asking for:
- City + State (text inputs or autocomplete)
- Monthly budget ceiling (number input)
- This is enough to bootstrap the dashboard. Module-specific config (target zips, commute addresses, favorite restaurants) lives in each module's own settings panel.

Module tables (housing listings, market stats, rates, etc.) are defined in each module's PRD and created via the same migration system.

---

## Navigation & Routing

### Routes

| Path | View | Back Target |
|------|------|-------------|
| `/` | Dashboard | n/a (home) |
| `/housing` | Housing module | `/` |
| `/cost-analytics` | Cost Analytics | `/` |
| `/wallet` | Wallet | `/` |
| `/settings` | Settings | `/` |

Future modules: `/portfolio`, `/food`

### Navigation Rules

1. The Dashboard (`/`) is always the home. It shows module summary cards.
2. Clicking a module card navigates to that module's route.
3. Module views and utility views show a back arrow (top-left) linking to `/`.
4. The sidebar highlights the current utility page (Cost Analytics, Wallet, Settings). When viewing the Dashboard or a module, no sidebar item is highlighted.
5. The top bar and sidebar are persistent across all routes (rendered in root `layout.tsx`).

---

## Top Bar Component

**File:** `components/layout/TopBar.tsx`

**Layout:** Full width, fixed height (~56px), dark background (bgPrimary or slightly darker).

**Left:** "TALARIA" in Inter semibold, uppercase, letter-spacing 0.1em, textSecondary color. No icon, no tagline.

**Right (flex row, gap-3, items-center):**
1. Wallet balance pill: rounded-full, bg slightly elevated, contains small wallet icon (Lucide `Wallet` at 14px) + balance in JetBrains Mono 13px. Background tint changes:
   - Balance > $10: subtle green tint
   - Balance $2-10: subtle amber tint  
   - Balance < $2: subtle red tint
2. Small vertical divider (1px, borderSubtle, 20px tall)
3. Cost pill: rounded-full, bg elevated, contains small receipt icon (Lucide `Receipt` at 14px) + "$X.XX today" in JetBrains Mono 13px, neutral color
4. Settings gear icon (Lucide `Settings` at 18px), clickable, links to `/settings`

**Data sources:**
- Wallet balance: read from `useWallet()` hook (initially hardcoded, later reads from Tempo CLI or API)
- Today's cost: computed from `mpp_transactions` where date = today, summing `cost_usd`

---

## Sidebar Component

**File:** `components/layout/Sidebar.tsx`

**Layout:** Fixed left, full height below top bar, width 180px, background bgSidebar.

**Items (vertically stacked, gap-2, padded):**
Each item is a row with icon (20px, Lucide) + label text (Inter, 13px). Active row has teal icon + teal text + subtle teal left border or background tint. Inactive rows have muted icon + muted text, hover brings them to secondary.

1. Bar chart icon + "Cost Analytics" → links to `/cost-analytics`
2. Wallet icon + "Wallet" → links to `/wallet`

**Bottom (absolute bottom, padded):**
3. Gear icon + "Settings" → links to `/settings`

**Active state:** When the current route matches, the icon and text color change to accentTeal and a subtle left border or background highlight appears.

**Inactive state:** Icons and text in textMuted. On hover, textSecondary.

---

## Dashboard Page

**File:** `app/page.tsx`

**Layout:**
1. Page title: "Dashboard" in Inter semibold, 20px, textPrimary
2. Module cards row: CSS grid, 3 columns, gap-4
3. Add Module row: CSS grid, 3 columns, gap-4 (below module cards)
4. Recent Transactions section: full width, below cards

### Module Card Component

**File:** `components/dashboard/ModuleCard.tsx`

**Props:**
```typescript
interface ModuleCardProps {
  id: string;           // 'housing'
  name: string;         // 'Housing'
  icon: LucideIcon;     // Home, TrendingUp, Utensils
  href: string;         // '/housing'
  metrics: {
    primary: { label: string; value: string; trend?: string; trendDirection?: 'up' | 'down' };
    secondary: Array<{ label: string; value: string }>;
  };
  customContent?: React.ReactNode;  // For Food's "Quick Reorder" button etc.
}
```

Each card is a `<Link>` wrapping a styled div. Card background: bgCard, border: borderSubtle, rounded-lg, padding 20px, hover: bgElevated transition.

### Add Module Card Component

**File:** `components/dashboard/AddModuleCard.tsx`

Dashed border (borderSubtle, dashed), centered "+" icon (Lucide `Plus` in a circle, muted), "Add Module" text below in textMuted. Non-functional — clicking does nothing. Same grid cell size as module cards.

### Recent Transactions Table

**File:** `components/dashboard/TransactionTable.tsx`

Reads last 10 transactions from `mpp_transactions` table, ordered by timestamp descending.

**Columns:** Timestamp | Service | Module | Rail | Cost

- Timestamp: JetBrains Mono, textMuted
- Service: Inter, textPrimary, with colored dot (consistent color per service)
- Module: Inter, textSecondary, capitalize
- Rail: `<RailIcon>` component — Tempo diamond icon or card icon
- Cost: JetBrains Mono, right-aligned, accentTeal for tempo, textPrimary for card

Header row: uppercase Inter 11px, textMuted, letter-spaced.

---

## Cost Tracking System

### MPP Transaction Logger

**File:** `lib/mpp.ts`

```typescript
export async function logMppTransaction(params: {
  service: string;
  module: string;
  endpoint?: string;
  rail?: 'tempo' | 'card';
  costUsd: number;
  metadata?: Record<string, unknown>;
}): Promise<void>

export function getTodaySpend(): number
export function getMonthSpend(): number
export function getLifetimeSpend(): number
export function getTransactions(opts: {
  limit?: number;
  offset?: number;
  module?: string;
  service?: string;
  dateFrom?: string;
  dateTo?: string;
}): Transaction[]

export function getSpendByService(dateFrom?: string, dateTo?: string): ServiceSpend[]
export function getDailySpend(days: number): DailySpend[]
```

Every module calls `logMppTransaction()` after every MPP API call. This is the single source of truth for cost tracking.

### Cost Analytics Page

**File:** `app/cost-analytics/page.tsx`

Uses the query functions from `lib/mpp.ts` to populate:
1. Top stat cards (lifetime, month, today, total calls, avg/session)
2. Daily spend area chart (Recharts `AreaChart`)
3. Service donut chart (Recharts `PieChart`)
4. Full transaction table with search filter, pagination, and CSV export
5. Bottom insight cards (computed: cheapest module, most expensive module, trend vs. prior period)

Time range selector (7d / 30d / 90d / All) filters all charts and the table simultaneously via React state.

CSV export: generates a blob from filtered transactions and triggers download.

---

## Wallet Page

**File:** `app/wallet/page.tsx`

### Wallet Balance

**Phase 1 (MVP):** Hardcode balance or read from a local config file. The user manually updates their balance after funding their Tempo wallet.

**Phase 2:** Shell out to `tempo wallet balance` CLI command, parse the output, and display the live balance. Or query the Tempo RPC endpoint directly for the wallet's USDC balance.

**File:** `lib/wallet.ts`

```typescript
export async function getWalletBalance(): Promise<{
  balance: number;
  address: string;
  network: string;
}>

export function getBalanceHealth(balance: number): 'healthy' | 'low' | 'critical'
```

### Wallet Page Sections

1. **Wallet card:** Balance display, address with copy-to-clipboard, health bar
2. **Funding channels:** Three static cards with action buttons (links to external flows — Coinbase, exchange deposit instructions, Tempo bridge URL)
3. **Recent activity:** Last 10 transactions from `mpp_transactions`, showing service, amount (negative), and running balance
4. **Payment methods:** Tempo wallet (active), Card (coming soon, disabled row)
5. **Spending controls:** Three toggle rows reading/writing `user_preferences`:
   - `daily_spend_limit` (null = disabled, number = limit in USD)
   - `low_balance_alert` (threshold in USD)
   - `auto_pause_empty` (boolean)

---

## Module Architecture

### Module Registry

**File:** `lib/modules.ts`

```typescript
interface ModuleDefinition {
  id: string;                     // 'housing'
  name: string;                   // 'Housing'
  icon: string;                   // 'Home' (Lucide icon name)
  route: string;                  // '/housing'
  services: string[];             // ['RentCast', 'Mapbox', 'Polymarket']
  getDashboardMetrics: () => Promise<DashboardMetrics>;
  getTables: () => string[];      // SQL CREATE TABLE statements
}

// Registry — modules self-register on import
const moduleRegistry: Map<string, ModuleDefinition> = new Map();

export function registerModule(def: ModuleDefinition): void
export function getRegisteredModules(): ModuleDefinition[]
export function getModule(id: string): ModuleDefinition | undefined
```

Each module exports a `register()` call that adds itself to the registry. The Dashboard reads from the registry to render module cards. This means adding a new module is:
1. Create a new directory under `app/` and `components/modules/`
2. Define the `ModuleDefinition`
3. Call `registerModule()` in the module's entry point
4. The Dashboard automatically shows the new card

### Dashboard Metrics Contract

Each module must implement `getDashboardMetrics()`:

```typescript
interface DashboardMetrics {
  primary: {
    label: string;      // "[City] Median Price"
    value: string;      // "$415,000"
    trend?: string;     // "↓2.1%"
    trendDirection?: 'up' | 'down';
    trendPeriod?: string; // "90d"
  };
  secondary: Array<{
    label: string;      // "Best 30yr Rate"
    value: string;      // "5.98%"
  }>;
  customContent?: 'food-reorder' | null;  // Special rendering flags
}
```

---

## Settings Page

**File:** `app/settings/page.tsx`

Sections:

1. **Profile:** Editable form for financial inputs (budget, down payment %, loan term, credit score tier). Reads/writes `user_preferences`. These propagate to all modules.

2. **Data & Storage:** Show SQLite file size, total rows across tables, last backup timestamp. "Clear All Data" button with confirmation modal. "Export Database" button that copies the .db file to a user-chosen location.

3. **Modules:** List of registered modules with enable/disable toggle. Each shows its MPP service dependencies.

---

## Build Order

**Phase 1 — Skeleton (do first):**
1. `npx create-next-app@latest talaria --typescript --tailwind --app`
2. Install dependencies: `better-sqlite3`, `lucide-react`, `recharts`
3. Set up design tokens and Tailwind config
4. Set up fonts (Inter + JetBrains Mono via `next/font/google`)
5. Implement database initialization (`lib/db.ts`, `lib/schema.ts`) — create core tables on first run
6. Build root layout with TopBar and Sidebar
7. Build Dashboard page with static/placeholder module cards and empty transaction table

**Phase 2 — Cost Tracking:**
8. Implement `lib/mpp.ts` — transaction logger and query functions
9. Wire TopBar's "today spend" pill to live data
10. Build Cost Analytics page with charts and full transaction table
11. Add CSV export

**Phase 3 — Wallet:**
12. Implement `lib/wallet.ts` — hardcoded balance for now
13. Build Wallet page with all sections
14. Wire TopBar's wallet balance pill to live data

**Phase 4 — Module Architecture:**
15. Implement module registry (`lib/modules.ts`)
16. Refactor Dashboard to render cards from registry
17. Create stub Housing module that registers itself and returns placeholder metrics
18. Verify the full navigation flow: Dashboard → Housing → back to Dashboard

**Phase 5 — Settings:**
19. Build Settings page with Profile, Data & Storage, and Modules sections
20. Wire preference changes to propagate to modules

After Phase 5, the Shell is complete and the Housing Module PRD takes over.

---

## API Routes (Next.js Route Handlers)

The app uses Next.js API routes for database operations so that SQLite (which runs in Node.js) can be accessed from client components.

```
app/api/
├── transactions/
│   ├── route.ts          # GET: list transactions, POST: log new transaction
│   └── stats/
│       └── route.ts      # GET: spend summaries (today, month, lifetime)
├── preferences/
│   └── route.ts          # GET/PUT: user preferences
├── wallet/
│   └── route.ts          # GET: wallet balance
└── modules/
    └── route.ts          # GET: registered modules + their dashboard metrics
```

Client components fetch from these endpoints. Server components can read the DB directly.
