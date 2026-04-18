import { NextRequest, NextResponse } from 'next/server';
import {
  getTodaySpend,
  getMonthSpend,
  getLifetimeSpend,
  getTotalCalls,
  getAvgCostPerSession,
  getSpendByService,
  getDailySpend,
} from '@/lib/mpp';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const days = Number(params.get('days')) || 7;

  const [today, month, lifetime, totalCalls, avgPerSession, byService, daily] = await Promise.all([
    getTodaySpend(),
    getMonthSpend(),
    getLifetimeSpend(),
    getTotalCalls(),
    getAvgCostPerSession(),
    getSpendByService(),
    getDailySpend(days),
  ]);

  return NextResponse.json({
    today,
    month,
    lifetime,
    totalCalls,
    avgPerSession,
    byService,
    daily,
  });
}
