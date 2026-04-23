import { NextRequest, NextResponse } from 'next/server';
import { getBookingDetails, bookReservation } from '@/lib/modules/food/resy-client';
import { dbRun, dbGet } from '@/lib/db';

// POST: Book a reservation.
// Body: { venue_id, venue_name, config_token, date, party_size, seating_type }
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { venue_id, venue_name, config_token, date, party_size, seating_type } = body;

  if (!config_token || !date || !party_size) {
    return NextResponse.json({ error: 'config_token, date, and party_size required' }, { status: 400 });
  }

  try {
    // Step 1: Get booking details (book token + payment method)
    const details = await getBookingDetails({
      configToken: config_token,
      date,
      partySize: party_size,
    });

    if (!details.bookToken) {
      return NextResponse.json({ error: 'Could not get book token — slot may no longer be available' }, { status: 409 });
    }

    if (!details.paymentMethodId) {
      return NextResponse.json({ error: 'No payment method on file with Resy' }, { status: 400 });
    }

    // Step 2: Book
    const result = await bookReservation({
      bookToken: details.bookToken,
      paymentMethodId: details.paymentMethodId,
    });

    // Step 3: Save to local DB
    // Find the restaurant_id from our cache
    const restaurant = await dbGet<{ id: number }>(
      'SELECT id FROM food_restaurants WHERE resy_venue_id = ?', venue_id
    );

    // Extract time from config_token or use a fallback
    const time = body.time ?? '';

    await dbRun(
      `INSERT INTO food_reservations
        (resy_reservation_id, restaurant_id, restaurant_name, date, time, party_size, status, seating_type, config_token)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
      result.resyToken,
      restaurant?.id ?? null,
      venue_name ?? 'Unknown',
      date,
      time,
      party_size,
      seating_type ?? 'Dining Room',
      config_token,
    );

    return NextResponse.json({
      ok: true,
      resyToken: result.resyToken,
      restaurant: venue_name,
      date,
      time,
      partySize: party_size,
    });
  } catch (err) {
    console.error('[food/book] error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
