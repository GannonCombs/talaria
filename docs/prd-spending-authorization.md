# Spending Authorization — Product Requirements Document

## Overview

Talaria makes paid API calls via the Machine Payments Protocol (MPP). Today, `paidFetch()` auto-negotiates 402 challenges and pays immediately — there is no approval step, no spending limits, and no biometric verification. This PRD adds a configurable approval gate that enforces spending limits and optionally requires Touch ID (macOS) or system credentials (Windows) before any money is spent.

**Depends on:** Talaria Shell (already built), Secure Key Storage PRD (keychain infrastructure)

**Reference implementation:** `visa-mcp/src/security/approval.ts`, `visa-mcp/src/security/limits.ts`, `visa-mcp/src/wallet/history.ts`

---

## Current State (No Controls)

- `paidFetch()` in `lib/mpp-client.ts` calls `client.fetch()` which auto-pays on 402 challenge
- Cost tracking exists (`mpp_transactions` table, `logMppTransaction()`) but is **post-hoc** — logged after payment, not a gate before payment
- `user_preferences` has `daily_spend_limit` (default: `'50'`) and `low_balance_alert` (default: `'5.00'`) but neither is enforced
- `components/wallet/SpendingControls.tsx` has UI for daily limit and low balance alert, but these are display-only preferences

---

## Target Architecture

```
Browser                         Next.js Server (Node.js)
   |                                    |
   |  POST /api/housing/refresh  ------>|
   |                                    |
   |                          ┌─────────┴──────────┐
   |                          │ 1. Estimate cost    │
   |                          │    ($0.033 RentCast) │
   |                          │                      │
   |                          │ 2. SpendLimits       │
   |                          │    .validate()       │
   |                          │    ✓ under max txn   │
   |                          │    ✓ under daily     │
   |                          │    ✓ under count     │
   |                          │                      │
   |                          │ 3. ApprovalManager   │
   |                          │    .requestApproval()│
   |                          │                      │
   |                ┌─────────┤    [Touch ID dialog  │
   |   Touch ID ◄───┤         │     appears on Mac]  │
   |   prompt       │         │                      │
   |   ──────► ─────┘         │ 4. Reserve txn       │
   |                          │    (status: pending)  │
   |                          │                      │
   |                          │ 5. paidFetch()       │
   |                          │    (actual MPP call)  │
   |                          │                      │
   |                          │ 6. Complete txn      │
   |                          │    (status: completed)│
   |                          └─────────┬──────────┘
   |                                    |
   |  <---- 200 OK (data) -------------|
```

This works because Talaria is a **local app** — the Next.js server runs on the same machine as the browser. The Touch ID subprocess appears as a native macOS dialog while the HTTP request is in-flight. The browser simply waits for the response.

---

## Configuration & Thresholds

Stored in the existing `user_preferences` table with `security.*` prefix keys.

### Settings

| Preference Key | Type | Default | Description |
|---|---|---|---|
| `security.approval_mode` | `'none' \| 'threshold' \| 'always-biometric'` | `'threshold'` | When to require biometric approval |
| `security.max_transaction` | number (USD) | `1.00` | Hard cap per single API call |
| `security.auto_approve_under` | number (USD) | `0.05` | Auto-approve threshold (threshold mode only) |
| `security.biometric_above` | number (USD) | `0.25` | Always require biometric above this (threshold mode) |
| `daily_spend_limit` | number (USD) | `5.00` | Max daily spend (existing key, reused + enforced) |
| `security.daily_txn_count` | number | `100` | Max transactions per day |
| `low_balance_alert` | number (USD) | `5.00` | Warn when balance drops below (existing key, reused) |

### Defaults Rationale (vs. visa-mcp)

Talaria API calls cost $0.005-$0.033. visa-mcp defaults ($100 max, $500 daily) are absurdly high for this use case.

| Setting | visa-mcp | Talaria | Why |
|---------|----------|---------|-----|
| `approval_mode` | `always-biometric` | `threshold` | Touch ID on every $0.01 RentCast call would be maddening |
| `max_transaction` | $100.00 | $1.00 | Largest single MPP call is ~$0.05 |
| `auto_approve_under` | $0.10 | $0.05 | Most calls are $0.005-$0.033 — auto-approve the common case |
| `biometric_above` | $5.00 | $0.25 | Anything above $0.25 is unusual for Talaria |
| `daily_limit` | $500.00 | $5.00 | Normal daily use is $0.05-$0.34 |
| `daily_txn_count` | 50 | 100 | Housing refresh makes many small calls per zip |

### Approval Ladder

```
requestApproval(amount):
  ├── mode = 'none'              → auto-approve (hard limits already checked)
  ├── mode = 'always-biometric'  → Touch ID / credential prompt always
  └── mode = 'threshold'
      ├── amount ≤ auto_approve_under  → auto-approve
      └── amount > auto_approve_under  → Touch ID / credential prompt
```

---

## Schema Change

**Migration v7** — Add a `status` column to `mpp_transactions` for atomic transaction reservation.

```sql
ALTER TABLE mpp_transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
CREATE INDEX IF NOT EXISTS idx_transactions_status ON mpp_transactions(status);
```

**Why this is needed:** Without a pending state, two concurrent API calls can both check the daily limit, both pass, and both pay — exceeding the limit. The `status` column lets us insert a "pending" row *before* paying. The second concurrent call sees the first's pending cost in the daily total and correctly refuses if the limit would be exceeded. SQLite's ACID transactions provide the atomicity guarantee — no file mutex needed (unlike visa-mcp's JSON approach).

**Status values:**
- `'pending'` — reserved before payment, counts toward daily limits immediately
- `'completed'` — payment succeeded (default for all existing rows)
- `'failed'` — payment failed or user denied approval

All existing rows default to `'completed'`, which is correct — they were already paid.

**File:** `lib/schema.ts` — bump `SCHEMA_VERSION` to 7, add migration.

---

## New Default Preferences

Add to `DEFAULT_PREFERENCES` in `lib/schema.ts`:

```typescript
'security.approval_mode': 'threshold',
'security.max_transaction': '1.00',
'security.auto_approve_under': '0.05',
'security.biometric_above': '0.25',
'security.daily_txn_count': '100',
// daily_spend_limit already exists, update default from '50' to '5'
```

---

## SpendLimits API

**File:** `lib/security/limits.ts`

Reads thresholds from `user_preferences` (via `lib/db.ts`). Reads daily stats from `mpp_transactions` (SQLite, not a JSON file).

```typescript
export interface SpendValidation {
  valid: boolean;
  errors: string[];
}

export class SpendLimits {
  // Check a single transaction against all limits
  static validateTransaction(amount: number): SpendValidation

  // Get current daily spending stats
  static getDailyStats(): {
    spent: number;
    limit: number;
    remaining: number;
    transactionsUsed: number;
    transactionLimit: number;
    transactionsRemaining: number;
  }
}
```

### `validateTransaction(amount)` Implementation

```typescript
static validateTransaction(amount: number): SpendValidation {
  const db = getDb();
  const errors: string[] = [];

  // Load thresholds from user_preferences
  const maxTransaction = getNumericPref(db, 'security.max_transaction', 1.00);
  const dailyLimit = getNumericPref(db, 'daily_spend_limit', 5.00);
  const maxCount = getNumericPref(db, 'security.daily_txn_count', 100);

  // Compute today's spend from mpp_transactions (pending + completed)
  const todayStats = db.prepare(`
    SELECT
      COALESCE(SUM(cost_usd), 0) as spent,
      COUNT(*) as txn_count
    FROM mpp_transactions
    WHERE date(timestamp) = date('now')
      AND status IN ('pending', 'completed')
  `).get() as { spent: number; txn_count: number };

  if (amount > maxTransaction) {
    errors.push(`Amount $${amount.toFixed(4)} exceeds max transaction limit of $${maxTransaction.toFixed(2)}`);
  }

  if (todayStats.spent + amount > dailyLimit) {
    errors.push(
      `Would exceed daily limit of $${dailyLimit.toFixed(2)} (spent today: $${todayStats.spent.toFixed(4)})`
    );
  }

  if (todayStats.txn_count >= maxCount) {
    errors.push(`Daily transaction count limit reached (${maxCount})`);
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Transaction Reservation

**File:** `lib/mpp.ts` — add reservation helpers alongside existing `logMppTransaction()`.

```typescript
// Reserve a transaction slot BEFORE payment. Returns the row ID.
// The pending row counts toward daily limits immediately.
export function reserveTransaction(params: {
  service: string;
  module: string;
  endpoint?: string;
  rail?: 'tempo' | 'card';
  estimatedCostUsd: number;
  metadata?: Record<string, unknown>;
}): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO mpp_transactions (service, module, endpoint, rail, cost_usd, status, metadata)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(
    params.service, params.module, params.endpoint ?? null,
    params.rail ?? 'tempo', params.estimatedCostUsd,
    params.metadata ? JSON.stringify(params.metadata) : null
  );
  return Number(result.lastInsertRowid);
}

// Mark a reserved transaction as completed (with optional actual cost update).
export function completeTransaction(id: number, actualCostUsd?: number): void {
  const db = getDb();
  if (actualCostUsd !== undefined) {
    db.prepare(`UPDATE mpp_transactions SET status = 'completed', cost_usd = ? WHERE id = ?`)
      .run(actualCostUsd, id);
  } else {
    db.prepare(`UPDATE mpp_transactions SET status = 'completed' WHERE id = ?`).run(id);
  }
}

// Mark a reserved transaction as failed (user denied, payment error, etc.).
export function failTransaction(id: number): void {
  const db = getDb();
  db.prepare(`UPDATE mpp_transactions SET status = 'failed' WHERE id = ?`).run(id);
}
```

The existing `getTodaySpend()` function must be updated to include pending transactions:

```typescript
export function getTodaySpend(): number {
  const db = getDb();
  const row = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total
    FROM mpp_transactions
    WHERE date(timestamp) = date('now')
      AND status IN ('pending', 'completed')
  `).get() as { total: number };
  return row.total;
}
```

---

## ApprovalManager API

**File:** `lib/security/approval.ts`

Ported from `visa-mcp/src/security/approval.ts`, adapted for Talaria (no Visa branding, Talaria branding in dialogs, "USDC (Tempo)" instead of "USDC (Base Network)").

```typescript
export interface ApprovalRequest {
  amount: number;
  merchantName: string;    // 'RentCast', 'Mapbox', etc.
  description: string;     // 'Market stats for 78745'
  rail: 'stablecoin';      // Talaria only uses stablecoin (Tempo USDC)
}

export interface ApprovalResult {
  approved: boolean;
  method: 'biometric' | 'dialog' | 'terminal' | 'auto';
  timestamp: string;
}

export class ApprovalManager {
  static async requestApproval(request: ApprovalRequest): Promise<ApprovalResult>

  // For sensitive config changes (e.g., updating spending controls)
  static async requestSensitiveConfirmation(action: string): Promise<boolean>

  // For destructive actions (e.g., clearing all keychain credentials)
  static async requestDestructiveConfirmation(action: string): Promise<boolean>
}
```

### Platform Dispatch

```
requestApproval(request):
  1. Read approval_mode from user_preferences
  2. Apply approval ladder (see above)
  3. If biometric needed:
     ├── macOS  → requestMacOSTouchIDApproval(request)
     ├── Windows → requestWindowsCredentialApproval(request)
     └── Linux  → requestTerminalApproval(request)
```

### macOS Touch ID Implementation

Compiled Objective-C subprocess using `LocalAuthentication` framework (same as visa-mcp, clang, not Swift):

```objectivec
#import <LocalAuthentication/LocalAuthentication.h>
#import <Foundation/Foundation.h>
int main() {
  LAContext *context = [[LAContext alloc] init];
  NSError *error = nil;
  if (![context canEvaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics error:&error]) {
    printf("RESULT:error\n");
    return 1;
  }
  dispatch_semaphore_t sem = dispatch_semaphore_create(0);
  __block BOOL ok = NO;
  [context evaluatePolicy:LAPolicyDeviceOwnerAuthenticationWithBiometrics
           localizedReason:@"${escapedReason}"
                     reply:^(BOOL success, NSError *err) { ok = success; dispatch_semaphore_signal(sem); }];
  dispatch_semaphore_wait(sem, DISPATCH_TIME_FOREVER);
  printf(ok ? "RESULT:success\n" : "RESULT:cancelled\n");
  return 0;
}
```

- Compile: `clang -framework LocalAuthentication -framework Foundation -o "${bin}" "${src}"` (30s timeout)
- Execute: `"${bin}"` (60s timeout — user may be slow to touch sensor)
- Output: `RESULT:success`, `RESULT:cancelled`, or `RESULT:error`
- Cleanup: `fs.rmSync(tmpDir, { recursive: true })` in `finally` block
- Fallback: if Touch ID unavailable (e.g., desktop Mac without Touch Bar), fall back to NSAlert dialog

**Touch ID reason string:** `"pay $0.03 to RentCast via USDC"` — clear, specific, shows the amount and service.

### macOS Dialog Fallback

NSAlert compiled via `clang -framework Cocoa` — shows amount, service, description. Two buttons: Approve / Cancel. Floating window level so it appears above all other windows.

### Windows Implementation

PowerShell `Get-Credential` prompt (Windows Hello):

```powershell
$cred = Get-Credential -Message "Talaria: Pay $0.03 to RentCast" -UserName $env:USERNAME
if ($cred) { "approved" } else { "cancelled" }
```

Fallback: `System.Windows.MessageBox` Yes/No dialog.

### Linux Implementation

Terminal `readline` prompt. Requires interactive TTY — denies in headless environments.

### String Escaping

All user-visible strings embedded in Objective-C or PowerShell are escaped:
- Objective-C: `\\`, `\"`, `\n`, `\r`, `\0` escaped; non-ASCII replaced with `?`; max 200 chars
- PowerShell: `"` → `\"`

---

## Cost Estimation

Before requesting approval, we need to know the cost. Rather than making a live 402 preview call (which adds latency), use a static cost table for known services:

**File:** `lib/security/costs.ts`

```typescript
// Known MPP service costs from docs/MPP_REFERENCE.md
const KNOWN_COSTS: Record<string, number> = {
  'rentcast.mpp.paywithlocus.com': 0.033,
  'mapbox.mpp.paywithlocus.com/mapbox/geocode-forward': 0.00375,
  'mapbox.mpp.paywithlocus.com/mapbox/isochrone': 0.005,
  'googlemaps.mpp.tempo.xyz': 0.01,
};

export function estimateCost(url: string): number | null {
  for (const [pattern, cost] of Object.entries(KNOWN_COSTS)) {
    if (url.includes(pattern)) return cost;
  }
  return null; // Unknown — caller should use previewMppCost() or a default
}
```

For unknown endpoints, fall back to `previewMppCost()` (existing function in `lib/mpp-client.ts` that reads the 402 challenge header without paying).

---

## Integration with `paidFetch()`

**File:** `lib/mpp-client.ts`

The approval gate wraps `paidFetch()` itself, so all call sites (rentcast.ts, mapbox.ts, listing-photo.ts) get protection automatically:

```typescript
export interface PaidFetchOptions {
  service?: string;       // 'RentCast', 'Mapbox', etc.
  module?: string;        // 'housing', 'portfolio', etc.
  endpoint?: string;      // '/rentcast/sale-listings', etc.
  estimatedCost?: number; // Override cost estimate (USD)
}

export async function paidFetch(
  url: string,
  init?: RequestInit,
  opts?: PaidFetchOptions,
): Promise<Response> {
  // 1. Estimate cost
  const cost = opts?.estimatedCost ?? estimateCost(url) ?? 0.05; // conservative fallback

  // 2. Validate against hard limits
  const validation = SpendLimits.validateTransaction(cost);
  if (!validation.valid) {
    throw new SpendLimitError(validation.errors);
  }

  // 3. Request approval (may trigger Touch ID)
  const approval = await ApprovalManager.requestApproval({
    amount: cost,
    merchantName: opts?.service ?? extractServiceName(url),
    description: opts?.endpoint ?? url,
    rail: 'stablecoin',
  });
  if (!approval.approved) {
    throw new ApprovalDeniedError(opts?.service ?? url);
  }

  // 4. Reserve transaction (pending — counts toward daily limits)
  const txId = reserveTransaction({
    service: opts?.service ?? 'unknown',
    module: opts?.module ?? 'unknown',
    endpoint: opts?.endpoint,
    estimatedCostUsd: cost,
  });

  // 5. Execute payment
  try {
    const client = await getMppxClient();
    const res = await client.fetch(url, init);
    completeTransaction(txId, cost);
    return res;
  } catch (e) {
    failTransaction(txId);
    throw e;
  }
}
```

### Cache-Aware Calls

`cachedMppCall()` already checks the cache before calling `paidFetch()`. Cache hits return immediately with no approval check — only actual paid calls trigger the gate.

### Error Types

```typescript
export class SpendLimitError extends Error {
  constructor(public errors: string[]) {
    super(`Spend limit exceeded: ${errors.join('; ')}`);
    this.name = 'SpendLimitError';
  }
}

export class ApprovalDeniedError extends Error {
  constructor(service?: string) {
    super(`Payment approval denied${service ? ` for ${service}` : ''}`);
    this.name = 'ApprovalDeniedError';
  }
}
```

Call sites should catch these and display user-friendly messages (e.g., "Daily spend limit reached" or "Payment cancelled").

---

## API Route Timeout

Touch ID waits for the user to touch the sensor — this can take 30+ seconds. API routes that trigger `paidFetch()` must not time out prematurely.

Next.js App Router API routes have a default timeout. For routes that make MPP calls (housing refresh, listing detail, etc.), set an appropriate `maxDuration`:

```typescript
// app/api/housing/refresh/route.ts
export const maxDuration = 120; // 2 minutes — enough for Touch ID + multiple API calls
```

---

## Settings Page Integration

**File:** `components/wallet/SpendingControls.tsx`

Expand the existing component (currently has Daily Spend Limit and Low Balance Alert toggles) with the full security controls:

### New Controls

1. **Approval Mode** — dropdown selector
   - `None` — auto-approve all payments (hard limits still enforced)
   - `Threshold` — auto-approve under threshold, biometric above (default)
   - `Always Biometric` — Touch ID for every payment regardless of amount

2. **Max Transaction** — number input with `$` prefix
   - Hard cap per single API call
   - Default: $1.00

3. **Auto-Approve Threshold** — number input with `$` prefix
   - Only visible when approval mode = Threshold
   - Default: $0.05

4. **Daily Transaction Count** — number input
   - Max API calls per day
   - Default: 100

5. **Daily Spend Limit** — existing toggle + number input (already built, keep as-is)

6. **Low Balance Alert** — existing toggle + number input (already built, keep as-is)

### Sensitive Settings Confirmation

Changing any `security.*` preference requires biometric confirmation. The flow:

```
1. User changes approval mode in UI
2. Client calls POST /api/security/confirm
   → Server triggers Touch ID / credential prompt
   → Returns { confirmed: true, token: '<one-time-token>' }
3. Client sends PUT /api/preferences with the token
   → Server validates token, saves preference
```

**File:** `app/api/security/confirm/route.ts`

```typescript
export async function POST(req: Request) {
  const { action } = await req.json();
  const confirmed = await ApprovalManager.requestSensitiveConfirmation(
    action ?? 'Update spending controls'
  );
  if (!confirmed) {
    return Response.json({ confirmed: false }, { status: 403 });
  }
  // Generate one-time token (random, expires in 60 seconds)
  const token = crypto.randomUUID();
  storeConfirmationToken(token); // in-memory map with TTL
  return Response.json({ confirmed: true, token });
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `lib/security/approval.ts` | Create | ApprovalManager — Touch ID, dialogs, terminal prompts |
| `lib/security/limits.ts` | Create | SpendLimits — validate against SQLite thresholds |
| `lib/security/costs.ts` | Create | Static cost table for known MPP services |
| `lib/mpp-client.ts` | Modify | Wrap `paidFetch()` with approval gate + reservation |
| `lib/mpp.ts` | Modify | Add `reserveTransaction()`, `completeTransaction()`, `failTransaction()`; update `getTodaySpend()` to include pending |
| `lib/schema.ts` | Modify | Migration v7 (status column), new default preferences |
| `components/wallet/SpendingControls.tsx` | Modify | Add approval mode dropdown, threshold inputs |
| `app/api/security/confirm/route.ts` | Create | Touch ID confirmation endpoint for settings changes |

---

## Build Order

### Phase 1: Schema + Limits (backend)
1. Bump `SCHEMA_VERSION` to 7 in `lib/schema.ts`; add migration for `status` column
2. Add new default preferences for `security.*` keys
3. Create `lib/security/costs.ts` (static cost table)
4. Create `lib/security/limits.ts` (SpendLimits class)
5. Add `reserveTransaction()`, `completeTransaction()`, `failTransaction()` to `lib/mpp.ts`
6. Update `getTodaySpend()` to include pending transactions
7. Wire `SpendLimits.validateTransaction()` into `paidFetch()` (limits only, no biometric yet)
8. **Test:** Set daily limit to $0.01, verify second API call in same day is rejected

### Phase 2: Biometric Approval (native)
9. Create `lib/security/approval.ts` (full ApprovalManager)
10. Wire `ApprovalManager.requestApproval()` into `paidFetch()`
11. Create `app/api/security/confirm/route.ts`
12. **Test:** Set `approval_mode` to `always-biometric` in DB, make an API call, verify Touch ID prompt appears

### Phase 3: Settings UI (frontend)
13. Expand `SpendingControls.tsx` with approval mode dropdown and threshold inputs
14. Wire settings changes to require biometric confirmation via `/api/security/confirm`
15. **Test:** Change approval mode in Settings, verify Touch ID is required for the change itself

### Phase 4: Error Handling + Polish
16. Add `SpendLimitError` and `ApprovalDeniedError` classes
17. Add user-friendly error banners in housing and other module UIs when spend limits are hit or approval is denied
18. Set `maxDuration` on API routes that make MPP calls
19. **Test:** Full end-to-end — housing refresh with threshold mode, verify auto-approve for small calls, Touch ID for larger calls, daily limit enforcement

---

## Verification

| Scenario | Expected |
|----------|----------|
| Normal housing refresh (5 zips × $0.033 = $0.17 total) | Threshold mode: each call auto-approved (under $0.05 each). No Touch ID prompts. |
| `approval_mode` = `always-biometric` | Touch ID prompt before every single API call |
| `approval_mode` = `none` | No prompts, auto-approve all (hard limits still enforced) |
| Daily limit = $0.01, make 2 calls | First call succeeds, second is rejected with SpendLimitError |
| Max transaction = $0.01, call RentCast ($0.033) | Rejected immediately — "exceeds max transaction limit" |
| User cancels Touch ID | ApprovalDeniedError thrown, transaction marked as failed, no money spent |
| Change approval mode in Settings | Touch ID confirmation required before the change is saved |
| Two concurrent API calls near daily limit | First reserves as pending, second sees pending in daily total, rejects if limit exceeded |
