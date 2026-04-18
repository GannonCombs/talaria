import { NextResponse } from 'next/server';
import { dbGet } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const dbPath = path.join(process.cwd(), 'talaria.db');

  // File size
  let fileSizeBytes = 0;
  try {
    const stat = fs.statSync(dbPath);
    fileSizeBytes = stat.size;
  } catch {
    // DB file may not exist yet
  }

  // Row counts per table
  const tables = ['mpp_transactions', 'user_preferences', 'modules'] as const;
  const rowCounts: Record<string, number> = {};
  let totalRows = 0;

  for (const table of tables) {
    const row = await dbGet<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table}`
    );
    const count = row?.count ?? 0;
    rowCounts[table] = count;
    totalRows += count;
  }

  return NextResponse.json({
    fileSizeBytes,
    fileSizeFormatted: formatBytes(fileSizeBytes),
    totalRows,
    rowCounts,
  });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
