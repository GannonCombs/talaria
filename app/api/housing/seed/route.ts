import { NextResponse } from 'next/server';
import { seedHousingData } from '@/lib/modules/housing/seed';

export async function POST() {
  const result = seedHousingData();
  return NextResponse.json({
    ok: true,
    seeded: result,
  });
}
