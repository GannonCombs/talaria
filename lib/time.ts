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

// Relative time from now ("just now", "5m ago", "2h ago", "3d ago").
// Accepts either an ISO string or a SQLite UTC string.
export function formatRelativeFromNow(timestamp: string): string {
  const d = timestamp.includes('T') && timestamp.endsWith('Z')
    ? new Date(timestamp)
    : parseSqliteUtc(timestamp);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}
