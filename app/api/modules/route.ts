import { NextResponse } from 'next/server';
import { getRegisteredModules } from '@/lib/modules';

export async function GET() {
  const modules = getRegisteredModules();

  const results = await Promise.all(
    modules.map(async (mod) => ({
      id: mod.id,
      name: mod.name,
      icon: mod.icon,
      route: mod.route,
      services: mod.services,
      metrics: await mod.getDashboardMetrics(),
      settingsFields: mod.getSettingsFields?.() ?? [],
    }))
  );

  return NextResponse.json(results);
}
