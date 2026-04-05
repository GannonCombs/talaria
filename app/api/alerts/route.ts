import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET: return alert preferences
export async function GET() {
  const db = getDb();

  const email = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.email'")
    .get() as { value: string } | undefined;

  const minScore = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.min_score'")
    .get() as { value: string } | undefined;

  const enabled = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.enabled'")
    .get() as { value: string } | undefined;

  return NextResponse.json({
    email: email?.value ?? '',
    minScore: Number(minScore?.value ?? 80),
    enabled: enabled?.value === 'true',
  });
}

// PUT: update alert preferences
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const db = getDb();

  const upsert = db.prepare(
    `INSERT INTO user_preferences (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  );

  if (body.email !== undefined) upsert.run('alert.email', body.email);
  if (body.minScore !== undefined) upsert.run('alert.min_score', String(body.minScore));
  if (body.enabled !== undefined) upsert.run('alert.enabled', String(body.enabled));

  return NextResponse.json({ ok: true });
}

// POST: trigger alert check (called by cron or manually)
// Checks for new high-score listings and sends email if configured
export async function POST() {
  const db = getDb();

  const email = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.email'")
    .get() as { value: string } | undefined;

  const minScore = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.min_score'")
    .get() as { value: string } | undefined;

  const enabled = db
    .prepare("SELECT value FROM user_preferences WHERE key = 'alert.enabled'")
    .get() as { value: string } | undefined;

  if (enabled?.value !== 'true' || !email?.value) {
    return NextResponse.json({ sent: false, reason: 'Alerts disabled or no email' });
  }

  const threshold = Number(minScore?.value ?? 80);

  // Find listings above threshold that haven't been alerted yet
  const newListings = db
    .prepare(
      `SELECT l.* FROM housing_listings l
       WHERE l.deal_score >= ?
       AND l.id NOT IN (
         SELECT CAST(value AS INTEGER) FROM user_preferences WHERE key = 'alert.sent_ids'
       )
       ORDER BY l.deal_score DESC
       LIMIT 5`
    )
    .all(threshold) as Array<{ id: number; address: string; price: number; deal_score: number }>;

  if (newListings.length === 0) {
    return NextResponse.json({ sent: false, reason: 'No new listings above threshold' });
  }

  // TODO: Send email via StableEmail MPP or Resend free tier
  // For now, just log and mark as alerted
  console.log(`ALERT: ${newListings.length} new listings above score ${threshold}`);
  newListings.forEach((l) => {
    console.log(`  - ${l.address}: $${l.price}, score ${l.deal_score}`);
  });

  return NextResponse.json({
    sent: true,
    count: newListings.length,
    listings: newListings.map((l) => ({ address: l.address, price: l.price, score: l.deal_score })),
    note: 'Email sending not yet wired — StableEmail or Resend integration needed',
  });
}
