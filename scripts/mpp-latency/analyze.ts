/**
 * Read all NDJSON logs → emit a markdown report.
 *
 * Round 1 stats: mean / median / max per phase, per service, and per proxy class.
 * No p95/p99 — sample sizes are too small for higher percentiles to be meaningful.
 *
 * Run: npx tsx scripts/mpp-latency/analyze.ts
 */

import fs from 'fs';
import path from 'path';
import { getAllLogFiles, readLogFile } from './log';
import type { CallResult } from './runner';

const REPORTS_DIR = path.join(process.cwd(), 'scripts', 'mpp-latency', 'reports');

interface CallRecord extends CallResult {
  run_id: string;
}

function loadAllCalls(): CallRecord[] {
  const files = getAllLogFiles();
  const all: CallRecord[] = [];
  for (const f of files) {
    all.push(...readLogFile(f));
  }
  return all;
}

interface PhaseStats {
  count: number;
  mean: number;
  median: number;
  max: number;
}

function statsFor(values: number[]): PhaseStats {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    mean: Math.round(sum / sorted.length),
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function tableRow(cells: string[]): string {
  return '| ' + cells.join(' | ') + ' |';
}

function generateMarkdown(calls: CallRecord[]): string {
  const successCalls = calls.filter((c) => c.result === 'success');
  const errorCalls = calls.filter((c) => c.result !== 'success');
  const totalSpend = calls.reduce((s, c) => s + c.cost_usd, 0);

  const lines: string[] = [];

  lines.push('# MPP Latency Round 1 Report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total calls: ${calls.length}`);
  lines.push(`- Successful: ${successCalls.length}`);
  lines.push(`- Errors / timeouts: ${errorCalls.length}`);
  lines.push(`- Total spend: $${totalSpend.toFixed(4)}`);
  lines.push('');

  // Per-service table
  lines.push('## Per-service totals');
  lines.push('');
  lines.push(tableRow(['Service', 'Class', 'Count', 'Mean (ms)', 'Median (ms)', 'Max (ms)']));
  lines.push(tableRow(['---', '---', '---:', '---:', '---:', '---:']));

  const byService = new Map<string, CallRecord[]>();
  for (const c of successCalls) {
    const arr = byService.get(c.service) ?? [];
    arr.push(c);
    byService.set(c.service, arr);
  }

  const serviceIds = Array.from(byService.keys()).sort();
  for (const svc of serviceIds) {
    const rows = byService.get(svc)!;
    const totals = statsFor(rows.map((r) => r.phases_ms.total));
    lines.push(
      tableRow([
        svc,
        rows[0].proxy_class,
        String(totals.count),
        String(totals.mean),
        String(totals.median),
        String(totals.max),
      ])
    );
  }
  lines.push('');

  // Per-service phase decomposition
  lines.push('## Per-service phase decomposition (median ms)');
  lines.push('');
  lines.push(tableRow(['Service', 'Initial 402', 'Payment', 'Retry resp', 'Body', 'Total']));
  lines.push(tableRow(['---', '---:', '---:', '---:', '---:', '---:']));

  for (const svc of serviceIds) {
    const rows = byService.get(svc)!;
    const init = statsFor(rows.map((r) => r.phases_ms.initial_402)).median;
    const pay = statsFor(rows.map((r) => r.phases_ms.payment)).median;
    const retry = statsFor(rows.map((r) => r.phases_ms.retry_response)).median;
    const body = statsFor(rows.map((r) => r.phases_ms.body)).median;
    const total = statsFor(rows.map((r) => r.phases_ms.total)).median;
    lines.push(tableRow([svc, String(init), String(pay), String(retry), String(body), String(total)]));
  }
  lines.push('');

  // Per-proxy-class table — the key Round 1 question
  lines.push('## Per-proxy-class totals (the key Round 1 table)');
  lines.push('');
  lines.push('Groups results by proxy infrastructure: locus / tempo / direct / x402-base.');
  lines.push('Tells us whether the slowness is proxy-class-specific.');
  lines.push('');
  lines.push(tableRow(['Class', 'Services', 'Calls', 'Mean total', 'Median total', 'Max total', 'Median payment', 'Median retry']));
  lines.push(tableRow(['---', '---', '---:', '---:', '---:', '---:', '---:', '---:']));

  const byClass = new Map<string, CallRecord[]>();
  for (const c of successCalls) {
    const arr = byClass.get(c.proxy_class) ?? [];
    arr.push(c);
    byClass.set(c.proxy_class, arr);
  }
  const classKeys = Array.from(byClass.keys()).sort();
  for (const cls of classKeys) {
    const rows = byClass.get(cls)!;
    const services = new Set(rows.map((r) => r.service));
    const totals = statsFor(rows.map((r) => r.phases_ms.total));
    const pay = statsFor(rows.map((r) => r.phases_ms.payment)).median;
    const retry = statsFor(rows.map((r) => r.phases_ms.retry_response)).median;
    lines.push(
      tableRow([
        cls,
        String(services.size),
        String(totals.count),
        String(totals.mean),
        String(totals.median),
        String(totals.max),
        String(pay),
        String(retry),
      ])
    );
  }
  lines.push('');

  // Outliers
  lines.push('## Outliers (total > 5000 ms)');
  lines.push('');
  const outliers = successCalls
    .filter((c) => c.phases_ms.total > 5000)
    .sort((a, b) => b.phases_ms.total - a.phases_ms.total);
  if (outliers.length === 0) {
    lines.push('_None._');
  } else {
    lines.push(tableRow(['Service', 'Endpoint', 'Total', 'Init', 'Pay', 'Retry', 'Body']));
    lines.push(tableRow(['---', '---', '---:', '---:', '---:', '---:', '---:']));
    for (const o of outliers) {
      const p = o.phases_ms;
      lines.push(
        tableRow([
          o.service,
          o.endpoint,
          String(p.total),
          String(p.initial_402),
          String(p.payment),
          String(p.retry_response),
          String(p.body),
        ])
      );
    }
  }
  lines.push('');

  // Errors
  if (errorCalls.length > 0) {
    lines.push('## Errors / timeouts');
    lines.push('');
    lines.push(tableRow(['Service', 'Endpoint', 'Result', 'Error', 'Total ms']));
    lines.push(tableRow(['---', '---', '---', '---', '---:']));
    for (const e of errorCalls) {
      lines.push(
        tableRow([
          e.service,
          e.endpoint,
          e.result,
          (e.error ?? '').replace(/\|/g, '\\|').slice(0, 80),
          String(e.phases_ms.total),
        ])
      );
    }
    lines.push('');
  }

  // Round 2 input
  lines.push('## Round 2 input');
  lines.push('');

  // Find slowest proxy class
  let worstClass = '';
  let worstMedian = 0;
  for (const cls of classKeys) {
    const rows = byClass.get(cls)!;
    const median = statsFor(rows.map((r) => r.phases_ms.total)).median;
    if (median > worstMedian) {
      worstMedian = median;
      worstClass = cls;
    }
  }

  if (worstClass) {
    const rows = byClass.get(worstClass)!;
    const init = statsFor(rows.map((r) => r.phases_ms.initial_402)).median;
    const pay = statsFor(rows.map((r) => r.phases_ms.payment)).median;
    const retry = statsFor(rows.map((r) => r.phases_ms.retry_response)).median;
    let dominant = 'initial_402';
    let dominantMs = init;
    if (pay > dominantMs) { dominant = 'payment'; dominantMs = pay; }
    if (retry > dominantMs) { dominant = 'retry_response'; dominantMs = retry; }
    lines.push(`- Worst proxy class: **${worstClass}** (median total ${worstMedian}ms)`);
    lines.push(`- Dominant phase in worst class: **${dominant}** (${dominantMs}ms median)`);
    lines.push(`- Round 2 reseller target: beat ${worstMedian}ms median total on the ${worstClass}-class equivalent path.`);
  } else {
    lines.push('_Insufficient data to identify a dominant phase._');
  }

  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const calls = loadAllCalls();
  if (calls.length === 0) {
    console.error('No log files found in scripts/mpp-latency/logs/. Run a sweep first.');
    process.exit(1);
  }

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const md = generateMarkdown(calls);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(REPORTS_DIR, `report-${ts}.md`);
  fs.writeFileSync(reportPath, md, 'utf8');

  console.log(md);
  console.log('');
  console.log(`Report written to: ${reportPath}`);
}

main();
