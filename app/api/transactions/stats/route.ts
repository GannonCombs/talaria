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

  return NextResponse.json({
    today: getTodaySpend(),
    month: getMonthSpend(),
    lifetime: getLifetimeSpend(),
    totalCalls: getTotalCalls(),
    avgPerSession: getAvgCostPerSession(),
    byService: getSpendByService(),
    daily: getDailySpend(days),
  });
}
