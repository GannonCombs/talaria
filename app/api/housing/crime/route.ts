import { NextResponse } from 'next/server';
import { fetchCrimeData } from '@/lib/modules/housing/crime';

// POST: fetch crime data from Austin PD, assign to listings, mark as wired
export async function POST() {
  try {
    const result = await fetchCrimeData();
    return NextResponse.json({
      ok: true,
      listingsUpdated: result.listingsUpdated,
      blockGroupsWithCrime: result.blockGroupsWithCrime,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Crime data fetch failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
