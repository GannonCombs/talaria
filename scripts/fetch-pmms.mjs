// Fetches the FRED PMMS (Primary Mortgage Market Survey) 30-year fixed
// rate series and writes the last 52 weeks to public/us-30yr-pmms.json.
//
// Usage:
//   node scripts/fetch-pmms.mjs                    # fetch live from FRED
//   node scripts/fetch-pmms.mjs --input <path>     # parse a local CSV
//
// FRED publishes weekly Thursdays. No API key required for the CSV graph
// download endpoint. Free.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRED_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US';
const WEEKS = 52;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'public', 'us-30yr-pmms.json');

function parseArgs(argv) {
  const args = { input: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--input' && argv[i + 1]) {
      args.input = argv[i + 1];
      i++;
    }
  }
  return args;
}

async function loadCsv(input) {
  if (input) {
    console.log(`Reading ${input}...`);
    return fs.readFile(input, 'utf8');
  }
  console.log(`Fetching ${FRED_URL}...`);
  const res = await fetch(FRED_URL);
  if (!res.ok) {
    throw new Error(`FRED responded ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// Exported so the unit test can import it without running the network/IO path.
export function parsePmmsCsv(csv) {
  // FRED CSV: header row then "YYYY-MM-DD,N.NN" rows. Header column names
  // change occasionally (DATE, observation_date, etc.) — skip by index to
  // be robust. Empty values appear as "." and must be filtered.
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines
    .map((line) => {
      const [date, value] = line.split(',');
      const num = Number(value);
      if (!date || !Number.isFinite(num)) return null;
      return { date: date.trim(), value: num };
    })
    .filter((r) => r !== null);
}

async function main() {
  const { input } = parseArgs(process.argv);
  const csv = await loadCsv(input);
  const rows = parsePmmsCsv(csv);

  if (rows.length === 0) {
    throw new Error('Parsed 0 rows from FRED CSV — format may have changed');
  }

  const recent = rows.slice(-WEEKS);
  await fs.writeFile(OUT_PATH, JSON.stringify(recent, null, 2));
  console.log(
    `Wrote ${recent.length} rows to ${OUT_PATH} ` +
      `(${recent[0].date} → ${recent[recent.length - 1].date}, ` +
      `latest rate ${recent[recent.length - 1].value}%)`
  );
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
