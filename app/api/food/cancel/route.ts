import { NextRequest, NextResponse } from 'next/server';
import { cancelReservation } from '@/lib/modules/food/resy-client';
import { dbRun } from '@/lib/db';

// POST: Cancel a reservation.
// Body: { resy_token }
export async function POST(request: NextRequest) {
  const { resy_token } = await request.json();
  if (!resy_token) {
    return NextResponse.json({ error: 'resy_token required' }, { status: 400 });
  }

  try {
    await cancelReservation({ resyToken: resy_token });

    // Update local record
    await dbRun(
      "UPDATE food_reservations SET status = 'cancelled', cancelled_at = datetime('now') WHERE resy_reservation_id = ?",
      resy_token
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[food/cancel] error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
