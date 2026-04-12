import { NextResponse } from 'next/server';
import { fetchCrimeData } from '@/lib/modules/housing/crime';

// POST: fetch fresh crime data from Austin PD and update neighborhood scores
export async function POST() {
  try {
    const result = await fetchCrimeData();
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      incidents: result.incidents,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Crime data fetch failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
