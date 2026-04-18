import { NextResponse } from 'next/server';
import { fetchFedPredictions, getLatestPrediction } from '@/lib/modules/housing/predictions';

export async function GET() {
  // Try live fetch (Polymarket + Kalshi), falls back to cache/mock
  try {
    const prediction = await fetchFedPredictions();
    return NextResponse.json(prediction);
  } catch {
    const cached = await getLatestPrediction();
    return NextResponse.json(cached);
  }
}
