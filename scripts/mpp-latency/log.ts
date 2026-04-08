/**
 * NDJSON writer + one-line stdout per call.
 *
 * One file per (run-id, service) combination so re-runs don't smash prior data.
 * Files live in scripts/mpp-latency/logs/ and are gitignored.
 */

import fs from 'fs';
import path from 'path';
import type { CallResult } from './runner';

const LOGS_DIR = path.join(process.cwd(), 'scripts', 'mpp-latency', 'logs');

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function logFilePath(runId: string, service: string): string {
  return path.join(LOGS_DIR, `${runId}-${service}.ndjson`);
}

export function writeCallResult(runId: string, result: CallResult): void {
  ensureLogsDir();
  const file = logFilePath(runId, result.service);
  fs.appendFileSync(file, JSON.stringify({ run_id: runId, ...result }) + '\n', 'utf8');
}

/**
 * One line per call, formatted compactly for live monitoring.
 *
 * Example:
 *   [openweather-current /openweather/current-weather] total=423ms (init=189 pay=210 retry=24 body=0)
 */
export function printCallSummary(result: CallResult): void {
  const p = result.phases_ms;
  const tag = result.result === 'success' ? '' : ` [${result.result}]`;
  const error = result.error ? ` ERR=${result.error}` : '';
  console.log(
    `[${result.service} ${result.endpoint}] total=${p.total}ms ` +
    `(init=${p.initial_402} pay=${p.payment} retry=${p.retry_response} body=${p.body})` +
    tag + error
  );
}

export function getAllLogFiles(): string[] {
  ensureLogsDir();
  return fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.endsWith('.ndjson') && f !== 'budget.json')
    .map((f) => path.join(LOGS_DIR, f));
}

export function readLogFile(filePath: string): Array<CallResult & { run_id: string }> {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter((l) => l.trim());
  return lines.map((l) => JSON.parse(l));
}
