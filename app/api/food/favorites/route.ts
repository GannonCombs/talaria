import { NextRequest, NextResponse } from 'next/server';
import { dbAll, dbRun, dbGet } from '@/lib/db';

// GET: List favorite restaurants (joined with restaurant details).
export async function GET() {
  const favorites = await dbAll(`
    SELECT f.id as favorite_id, f.sort_order, f.added_at,
           r.id, r.resy_venue_id, r.name, r.cuisine, r.price_range, r.rating,
           r.neighborhood, r.image_url, r.resy_url
    FROM food_favorites f
    JOIN food_restaurants r ON r.id = f.restaurant_id
    WHERE r.is_active = 1
    ORDER BY f.sort_order ASC, r.rating DESC
  `);
  return NextResponse.json(favorites);
}

// POST: Add a restaurant to favorites.
// Body: { restaurant_id }
export async function POST(request: NextRequest) {
  const { restaurant_id } = await request.json();
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 });
  }

  // Check if already favorited
  const existing = await dbGet(
    'SELECT id FROM food_favorites WHERE restaurant_id = ?', restaurant_id
  );
  if (existing) {
    return NextResponse.json({ ok: true, already: true });
  }

  await dbRun(
    'INSERT INTO food_favorites (restaurant_id) VALUES (?)',
    restaurant_id
  );
  return NextResponse.json({ ok: true });
}

// DELETE: Remove a restaurant from favorites.
// Body: { restaurant_id }
export async function DELETE(request: NextRequest) {
  const { restaurant_id } = await request.json();
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 });
  }

  await dbRun(
    'DELETE FROM food_favorites WHERE restaurant_id = ?',
    restaurant_id
  );
  return NextResponse.json({ ok: true });
}
