import { NextRequest, NextResponse } from 'next/server';
import { dbGet, dbRun } from '@/lib/db';
import { refreshListingsForCity } from '@/lib/modules/housing/rentcast';

// Cooldown: at most one refresh attempt per hour for any (city, state)
// pair. Even a *failed* attempt counts — we don't want network flakes
// or 402 errors to fire on every page reload until they work. The user
// can wait the cooldown out, or manually clear the pref to retry early.
export const COOLDOWN_MINUTES = 60;

export interface RefreshAttempt {
  city: string;
  state: string;
  startedAt: string;
}

// Pure function (no DB access) so tests can exercise it directly with
// a synthetic attempt + a known "now" timestamp.
export function inCooldownAt(
  attempt: RefreshAttempt | null,
  now: number,
  cooldownMinutes = COOLDOWN_MINUTES
): boolean {
  if (!attempt) return false;
  const startedMs = new Date(attempt.startedAt).getTime();
  const ageMinutes = (now - startedMs) / (1000 * 60);
  return ageMinutes < cooldownMinutes;
}

async function getLastAttempt(): Promise<RefreshAttempt | null> {
  const row = await dbGet<{ value: string }>(
    "SELECT value FROM user_preferences WHERE key = 'housing.listings_last_refresh_attempt'"
  );
  if (!row) return null;
  try {
    return JSON.parse(row.value) as RefreshAttempt;
  } catch {
    return null;
  }
}

async function writeAttempt(city: string, state: string): Promise<void> {
  const attempt: RefreshAttempt = {
    city,
    state,
    startedAt: new Date().toISOString(),
  };
  await dbRun(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES ('housing.listings_last_refresh_attempt', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    JSON.stringify(attempt)
  );
}

function inCooldown(attempt: RefreshAttempt | null): boolean {
  return inCooldownAt(attempt, Date.now());
}

export async function POST(request: NextRequest) {
  let body: { city?: string; state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { city, state } = body;
  if (!city || !state) {
    return NextResponse.json(
      { error: 'city and state required' },
      { status: 400 }
    );
  }

  // Cooldown check (defense in depth — the client also checks this).
  const lastAttempt = await getLastAttempt();
  if (inCooldown(lastAttempt)) {
    const ageMinutes = lastAttempt
      ? Math.floor((Date.now() - new Date(lastAttempt.startedAt).getTime()) / (1000 * 60))
      : 0;
    return NextResponse.json(
      {
        skipped: true,
        skippedReason: 'cooldown',
        cooldownMinutesRemaining: COOLDOWN_MINUTES - ageMinutes,
        lastAttempt,
      },
      { status: 200 }
    );
  }

  // Write the attempt timestamp BEFORE the MPP call. If the call fails
  // or hangs, the cooldown is still set, so we don't loop on errors.
  await writeAttempt(city, state);

  try {
    const result = await refreshListingsForCity(city, state);
    return NextResponse.json({
      skipped: false,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      {
        skipped: false,
        error: 'refresh failed',
        detail: message,
      },
      { status: 500 }
    );
  }
}
