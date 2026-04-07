// SQLite stores timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC (the format
// produced by `datetime('now')`). The string carries no TZ designator, so
// `new Date(str)` would parse it as *local* time and shift it by the local
// offset. We append 'Z' to force UTC parsing, then format in Central Time.

const CENTRAL_TZ = 'America/Chicago';

function parseSqliteUtc(timestamp: string): Date {
  // Tolerate both 'YYYY-MM-DD HH:MM:SS' and ISO-ish 'YYYY-MM-DDTHH:MM:SS'.
  const iso = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T');
  return new Date(iso + 'Z');
}

// Compact display for transaction tables: '04/06 11:32:43 PM CDT'.
// Includes the date because txn lists span multiple days.
export function formatTxnTimestamp(timestamp: string): string {
  const d = parseSqliteUtc(timestamp);
  return d.toLocaleString('en-US', {
    timeZone: CENTRAL_TZ,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}
