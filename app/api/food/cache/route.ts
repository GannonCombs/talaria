import { NextResponse } from 'next/server';
import { dbAll, dbBatch, dbRun } from '@/lib/db';
import { searchRestaurants } from '@/lib/modules/food/resy-client';

// POST: Refresh the restaurant cache from Resy.
// Paginates through Austin results and upserts into food_restaurants.
export async function POST() {
  try {
    const allRestaurants = [];
    let page = 1;
    const perPage = 50;

    // Paginate through Resy search results
    while (true) {
      const batch = await searchRestaurants({ perPage, page });
      allRestaurants.push(...batch);
      if (batch.length < perPage) break; // last page
      page++;
      // Small delay between pages to be respectful
      await new Promise((r) => setTimeout(r, 200));
    }

    if (allRestaurants.length === 0) {
      return NextResponse.json({ error: 'No restaurants returned from Resy' }, { status: 502 });
    }

    // Mark all existing restaurants as inactive, then re-activate found ones
    await dbRun("UPDATE food_restaurants SET is_active = 0");

    // Upsert in batches
    const statements = allRestaurants.map((r) => ({
      sql: `INSERT INTO food_restaurants
        (resy_venue_id, name, cuisine, price_range, rating, neighborhood, address, latitude, longitude, image_url, description, resy_url, is_active, last_cached_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
        ON CONFLICT(resy_venue_id) DO UPDATE SET
          name=excluded.name, cuisine=excluded.cuisine, price_range=excluded.price_range,
          rating=excluded.rating, neighborhood=excluded.neighborhood, address=excluded.address,
          latitude=excluded.latitude, longitude=excluded.longitude, image_url=excluded.image_url,
          description=excluded.description, resy_url=excluded.resy_url,
          is_active=1, last_cached_at=datetime('now')`,
      args: [
        r.venueId, r.name, r.cuisine, r.priceRange, r.rating,
        r.neighborhood, r.address, r.latitude, r.longitude,
        r.imageUrl, r.description, r.resyUrl,
      ],
    }));

    // Batch in chunks of 50
    for (let i = 0; i < statements.length; i += 50) {
      await dbBatch(statements.slice(i, i + 50));
    }

    return NextResponse.json({
      ok: true,
      cached: allRestaurants.length,
      pages: page,
    });
  } catch (err) {
    console.error('[food/cache] error:', err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// GET: Return cached restaurants, optionally filtered.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const cuisine = url.searchParams.get('cuisine');
  const priceRange = url.searchParams.get('price_range');

  let sql = 'SELECT * FROM food_restaurants WHERE is_active = 1';
  const args: (string | number)[] = [];

  if (cuisine && cuisine !== 'Any') {
    sql += ' AND cuisine LIKE ?';
    args.push(`%${cuisine}%`);
  }
  if (priceRange) {
    sql += ' AND price_range = ?';
    args.push(Number(priceRange));
  }

  sql += ' ORDER BY rating DESC LIMIT 50';

  const restaurants = await dbAll(sql, ...args);
  return NextResponse.json(restaurants);
}
