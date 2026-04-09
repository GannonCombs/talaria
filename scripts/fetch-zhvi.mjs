// Fetches the Zillow ZHVI (Home Value Index) zip-level CSV and the
// Census-style ZIP code GeoJSON for Texas, then filters both to the
// Austin metro area and writes two artifacts:
//
//   public/austin-zhvi.json     — { fetchedAt, lastDataMonth, metro, zips: { "78704": [{date, value}, ...] } }
//   public/austin-zips.geojson  — Austin metro ZCTA polygons
//
// Both data sources are FREE public datasets — no API key, no MPP, no spend.
//
// Usage:
//   node scripts/fetch-zhvi.mjs                       # fetch both live
//   node scripts/fetch-zhvi.mjs --csv <path>          # use a local ZHVI CSV
//   node scripts/fetch-zhvi.mjs --geo <path>          # use a local TX zip GeoJSON
//   node scripts/fetch-zhvi.mjs --csv X --geo Y       # both local
//
// Mirrors the pattern in scripts/fetch-pmms.mjs.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Source URLs ──────────────────────────────────────────────────────────────

// Zillow ZHVI: middle tier ($0.33-0.67 quantile), smoothed, seasonally adjusted,
// all home types (SFR + condo). This URL has been stable for years but Zillow
// occasionally renames files — if it 404s, the user can pass --csv with a
// manually downloaded CSV from https://www.zillow.com/research/data/.
//
// Two flavors used here:
//   - Zip CSV     → per-zip historical series (drives the heat map polygons)
//   - City CSV    → Zillow's published Austin city-level series (drives the
//                   dashboard tile and the right-panel sparkline)
//
// We need both because Zillow's city-level ZHVI is a proprietary weighted
// aggregate, NOT the raw median across the city's zip codes. Computing our
// own median across zip values produces a materially different number
// (~$53K / ~11% lower for Austin) — the canonical Zillow city number is
// what users expect to see and what we used to display before Round 4.
const ZHVI_URL =
  'https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';
const CITY_ZHVI_URL =
  'https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv';

// Texas ZCTA polygons. The OpenDataDE/State-zip-code-GeoJSON repo is the most
// popular community source for state-level zip code GeoJSONs. Same fallback
// pattern: --geo overrides if the URL drifts.
const TX_GEOJSON_URL =
  'https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/tx_texas_zip_codes_geo.min.json';

// ── Constants ────────────────────────────────────────────────────────────────

// How many months of per-zip history to keep in the artifact. The Price
// Trends slider in the LeftPanel goes up to 60 months (5 years). To compute
// a 60-month change we need 61 data points (latest + the value 60 months
// prior), so we keep 72 to give a 12-month safety buffer in case the
// slider's max ever bumps up.
const MONTHS_OF_HISTORY = 72;

// How many months of city-level history to keep in `medianSeries`. The right
// panel sparkline label is "36mo" so we trim to 36 months. Sparkline length
// affects visual shape — sending more months would silently change the
// chart's appearance even though the label says 36mo.
const CITY_MONTHS_OF_HISTORY = 36;

// Filter strings. We default to City="Austin" to keep the heat map tight
// to the actual city of Austin (~30-40 zips). Falling back to the broader
// metro filter (~87 zips, including Round Rock, Cedar Park, Pflugerville,
// etc.) if the city filter matches zero, then to county as a last resort.
// Round 4's first iteration used the metro filter and the resulting heat
// map was visually noisy because the polygons sprawled all the way out to
// Hutto / Manor / Buda — too much area, too little signal. City="Austin"
// is the right default for the demo.
const AUSTIN_CITY = 'Austin';
const AUSTIN_METRO = 'Austin-Round Rock-Georgetown, TX';
const TRAVIS_COUNTY = 'Travis County';

// ── Path helpers ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ZHVI_OUT = path.join(PUBLIC_DIR, 'austin-zhvi.json');
const GEO_OUT = path.join(PUBLIC_DIR, 'austin-zips.geojson');

// ── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { csv: null, citycsv: null, geo: null };
  for (let i = 2; i < argv.length; i++) {
    if ((argv[i] === '--csv' || argv[i] === '--input') && argv[i + 1]) {
      args.csv = argv[i + 1];
      i++;
    } else if (argv[i] === '--citycsv' && argv[i + 1]) {
      args.citycsv = argv[i + 1];
      i++;
    } else if (argv[i] === '--geo' && argv[i + 1]) {
      args.geo = argv[i + 1];
      i++;
    }
  }
  return args;
}

// ── CSV loading ──────────────────────────────────────────────────────────────

async function loadZhviCsv(input) {
  if (input) {
    console.log(`Reading ZHVI CSV from ${input}...`);
    return fs.readFile(input, 'utf8');
  }
  console.log(`Fetching ZHVI CSV from ${ZHVI_URL}...`);
  const res = await fetch(ZHVI_URL);
  if (!res.ok) {
    throw new Error(
      `Zillow responded ${res.status} ${res.statusText}\n` +
        `URL: ${ZHVI_URL}\n` +
        `If Zillow has renamed the file, download the current zip-level ZHVI CSV from\n` +
        `  https://www.zillow.com/research/data/\n` +
        `and pass it via: node scripts/fetch-zhvi.mjs --csv <path>`
    );
  }
  return res.text();
}

async function loadCityZhviCsv(input) {
  if (input) {
    console.log(`Reading City ZHVI CSV from ${input}...`);
    return fs.readFile(input, 'utf8');
  }
  console.log(`Fetching City ZHVI CSV from ${CITY_ZHVI_URL}...`);
  const res = await fetch(CITY_ZHVI_URL);
  if (!res.ok) {
    throw new Error(
      `Zillow responded ${res.status} ${res.statusText}\n` +
        `URL: ${CITY_ZHVI_URL}\n` +
        `If Zillow has renamed the file, download the city-level ZHVI CSV from\n` +
        `  https://www.zillow.com/research/data/\n` +
        `and pass it via: node scripts/fetch-zhvi.mjs --citycsv <path>`
    );
  }
  return res.text();
}

async function loadTxGeoJson(input) {
  if (input) {
    console.log(`Reading TX zip GeoJSON from ${input}...`);
    const text = await fs.readFile(input, 'utf8');
    return JSON.parse(text);
  }
  console.log(`Fetching TX zip GeoJSON from ${TX_GEOJSON_URL}...`);
  const res = await fetch(TX_GEOJSON_URL);
  if (!res.ok) {
    throw new Error(
      `OpenDataDE responded ${res.status} ${res.statusText}\n` +
        `URL: ${TX_GEOJSON_URL}\n` +
        `Pass --geo <path> if you have a local copy.`
    );
  }
  return res.json();
}

// ── CSV parsing (exported for tests) ─────────────────────────────────────────

/**
 * Parse the Zillow ZHVI zip-level CSV. The header row is:
 *   RegionID, SizeRank, RegionName, RegionType, StateName, State, City, Metro, CountyName, <date1>, <date2>, ...
 * where dates are month-end ISO strings (YYYY-MM-DD).
 *
 * Each subsequent row has the historical values for one zip.
 *
 * Filter by metro/county. Trim to last `historyMonths` months.
 * Returns: { lastDataMonth, zips: { "78704": [{date, value}, ...] } }
 *
 * Exported so the unit test can call it without network/IO.
 */
export function parseZhviCsv(csv, opts = {}) {
  const city = opts.city ?? AUSTIN_CITY;
  const metro = opts.metro ?? AUSTIN_METRO;
  const county = opts.county ?? TRAVIS_COUNTY;
  const historyMonths = opts.historyMonths ?? MONTHS_OF_HISTORY;

  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    return { lastDataMonth: null, zips: {} };
  }

  // CSV cells can contain commas inside quotes (the Metro field includes
  // a comma: "Austin-Round Rock-Georgetown, TX"). Use a tiny CSV-aware
  // splitter that respects double quotes — sufficient for Zillow's format.
  function splitCsv(line) {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  const header = splitCsv(lines[0]);
  // Find the column indices we care about. Names are well-known.
  const idxRegionName = header.indexOf('RegionName');
  const idxRegionType = header.indexOf('RegionType');
  const idxState = header.indexOf('State');
  const idxCity = header.indexOf('City');
  const idxMetro = header.indexOf('Metro');
  const idxCounty = header.indexOf('CountyName');

  if (idxRegionName < 0 || idxState < 0 || idxMetro < 0) {
    throw new Error(
      `ZHVI CSV header missing expected columns. Got: ${header.slice(0, 12).join(', ')}...`
    );
  }

  // Date columns start AFTER the metadata columns. The last metadata column
  // is CountyName (or whichever is last). All columns after that are dates.
  const lastMetaIdx = Math.max(
    idxRegionName,
    idxRegionType,
    idxState,
    idxCity,
    idxMetro,
    idxCounty
  );
  const dateCols = header.slice(lastMetaIdx + 1);
  // Trim to the last N months
  const trimmedDateCols = dateCols.slice(-historyMonths);
  const trimStartIdx = lastMetaIdx + 1 + (dateCols.length - trimmedDateCols.length);

  // First pass: try city filter (most restrictive — just City of Austin
  // proper, ~30-40 zips). Fall back to metro (~87 zips, includes Round
  // Rock / Cedar Park / Pflugerville / etc.). Fall back to county as a
  // last resort.
  function passesCity(cells) {
    return idxCity >= 0 && cells[idxCity] === city;
  }
  function passesMetro(cells) {
    return idxMetro >= 0 && cells[idxMetro] === metro;
  }
  function passesCounty(cells) {
    return idxCounty >= 0 && cells[idxCounty] === county;
  }

  const zips = {};
  let lastDataMonth = null;

  // Pre-parse all data rows so we can decide between city/metro/county after
  const dataRows = lines.slice(1).map(splitCsv);

  let rows = dataRows.filter(passesCity);
  if (rows.length === 0) {
    console.warn(`No rows matched city="${city}", falling back to metro="${metro}"`);
    rows = dataRows.filter(passesMetro);
  }
  if (rows.length === 0) {
    console.warn(`No rows matched metro="${metro}", falling back to county="${county}"`);
    rows = dataRows.filter(passesCounty);
  }

  for (const cells of rows) {
    const zip = cells[idxRegionName];
    if (!zip) continue;

    const series = [];
    for (let j = 0; j < trimmedDateCols.length; j++) {
      const date = trimmedDateCols[j];
      const raw = cells[trimStartIdx + j];
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) continue; // skip blanks/zero
      series.push({ date, value: num });
    }
    if (series.length > 0) {
      zips[zip] = series;
      const last = series[series.length - 1].date;
      if (!lastDataMonth || last > lastDataMonth) lastDataMonth = last;
    }
  }

  return { lastDataMonth, zips };
}

/**
 * Parse Zillow's City-level ZHVI CSV and extract a single city's
 * historical time series. Schema:
 *   RegionID, SizeRank, RegionName, RegionType, StateName, State, Metro, CountyName, <date1>, <date2>, ...
 *
 * RegionName is the city name (e.g., "Austin"). State is the two-letter
 * code. Multiple cities are named "Austin" across the country (TX, MN,
 * AR, IN, PA, ...) so we filter by `RegionName + State` to disambiguate.
 *
 * The default is Austin, TX. Returns the trimmed time series (last
 * `historyMonths` months) so the artifact stays small.
 *
 * This is the CANONICAL Zillow city-level ZHVI — a proprietary weighted
 * aggregate Zillow ships, NOT a derived statistic. We use it (rather than
 * computing our own median across zip values) because Zillow's number is
 * what consumers expect to see and what Talaria displayed before Round 4.
 *
 * Exported so the unit test can call it without network/IO.
 */
export function parseCityZhviCsv(csv, opts = {}) {
  const cityName = opts.cityName ?? AUSTIN_CITY;
  const stateCode = opts.stateCode ?? 'TX';
  const historyMonths = opts.historyMonths ?? CITY_MONTHS_OF_HISTORY;

  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  // Reuse the same quote-aware splitter logic via a local helper
  function splitCsv(line) {
    const out = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }

  const header = splitCsv(lines[0]);
  const idxRegionName = header.indexOf('RegionName');
  const idxState = header.indexOf('State');
  const idxRegionType = header.indexOf('RegionType');
  const idxMetro = header.indexOf('Metro');
  const idxCounty = header.indexOf('CountyName');
  if (idxRegionName < 0 || idxState < 0) {
    throw new Error(
      `City ZHVI CSV header missing expected columns. Got: ${header.slice(0, 12).join(', ')}...`
    );
  }

  // Date columns start after the metadata columns. The City CSV has no
  // City column (the City IS the RegionName) so the last metadata index
  // is whichever of these comes last in the schema.
  const lastMetaIdx = Math.max(
    idxRegionName,
    idxState,
    idxRegionType,
    idxMetro,
    idxCounty
  );
  const dateCols = header.slice(lastMetaIdx + 1);
  const trimmedDateCols = dateCols.slice(-historyMonths);
  const trimStartIdx = lastMetaIdx + 1 + (dateCols.length - trimmedDateCols.length);

  // Find the first row matching cityName + stateCode. There's exactly one
  // city named "Austin" in TX so this is unambiguous.
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsv(lines[i]);
    if (cells[idxRegionName] !== cityName) continue;
    if (cells[idxState] !== stateCode) continue;

    const series = [];
    for (let j = 0; j < trimmedDateCols.length; j++) {
      const date = trimmedDateCols[j];
      const raw = cells[trimStartIdx + j];
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) continue;
      series.push({ date, value: num });
    }
    return series;
  }

  // No row matched — return empty so the consumer can decide what to do
  return [];
}

// ── GeoJSON filter ───────────────────────────────────────────────────────────

/**
 * Filter a Texas-statewide ZCTA GeoJSON down to just the zips we have ZHVI
 * data for. The OpenDataDE GeoJSON property name is `ZCTA5CE10` for the
 * 2010 vintage; if Zillow updates to 2020 ZCTAs the property name might
 * become `ZCTA5CE20`. Be flexible.
 *
 * Exported so the unit test can call it without network/IO.
 */
export function filterGeoJsonByZips(geojson, allowedZips) {
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Input is not a valid GeoJSON FeatureCollection');
  }
  const allow = new Set(allowedZips);
  const features = geojson.features.filter((f) => {
    const props = f?.properties ?? {};
    const zip =
      props.ZCTA5CE10 ?? props.ZCTA5CE20 ?? props.ZCTA5 ?? props.zip ?? props.ZIPCODE;
    return zip && allow.has(String(zip));
  });
  // Normalize the property name to `zip` so the map component doesn't have
  // to know about Census vintage naming quirks.
  for (const f of features) {
    const props = f.properties ?? {};
    const zip =
      props.ZCTA5CE10 ?? props.ZCTA5CE20 ?? props.ZCTA5 ?? props.zip ?? props.ZIPCODE;
    f.properties = { ...props, zip: String(zip) };
  }
  return { type: 'FeatureCollection', features };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // 1. ZHVI CSV → parsed time series per Austin zip
  const csv = await loadZhviCsv(args.csv);
  const parsed = parseZhviCsv(csv);
  const zipCount = Object.keys(parsed.zips).length;
  if (zipCount === 0) {
    throw new Error(
      'Parsed 0 Austin zips from ZHVI CSV. The metro filter may have changed.\n' +
        'Try downloading the CSV manually and inspecting the Metro column for Austin.'
    );
  }
  console.log(`Parsed ${zipCount} Austin zips, latest data month: ${parsed.lastDataMonth}`);

  // Pull the canonical Zillow Austin city ZHVI series from the City CSV.
  // This drives the dashboard tile + the housing right-panel sparkline.
  // It is NOT derived from the per-zip data above — Zillow ships its own
  // city-level aggregate that uses a proprietary weighting, and it's the
  // number consumers expect to see.
  const cityCsv = await loadCityZhviCsv(args.citycsv);
  const medianSeries = parseCityZhviCsv(cityCsv);
  if (medianSeries.length === 0) {
    throw new Error(
      `Parsed 0 months for Austin TX from City ZHVI CSV. The schema may have changed.`
    );
  }
  const latestCity = medianSeries[medianSeries.length - 1];
  console.log(
    `Parsed Austin city series: ${medianSeries.length} months, latest ${latestCity.date} = $${Math.round(latestCity.value).toLocaleString()}`
  );

  // Write the ZHVI artifact
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  const zhviArtifact = {
    fetchedAt: new Date().toISOString(),
    lastDataMonth: parsed.lastDataMonth,
    city: AUSTIN_CITY,
    metro: AUSTIN_METRO,
    // The dashboard tile and right panel both read `medianSeries`. Despite
    // the name, this is the canonical Zillow city-level ZHVI for Austin TX,
    // not a derived median.
    medianSeries,
    zips: parsed.zips,
  };
  await fs.writeFile(ZHVI_OUT, JSON.stringify(zhviArtifact));
  const zhviSize = (await fs.stat(ZHVI_OUT)).size;
  console.log(`✓ Wrote ${ZHVI_OUT} (${(zhviSize / 1024).toFixed(0)} KB)`);

  // 2. TX zip GeoJSON → filtered to the same zips we have ZHVI for
  const txGeo = await loadTxGeoJson(args.geo);
  const filteredGeo = filterGeoJsonByZips(txGeo, Object.keys(parsed.zips));
  if (filteredGeo.features.length === 0) {
    throw new Error(
      'Filtered GeoJSON has 0 features. The ZIP property name may not match — ' +
        'check the OpenDataDE file format or pass --geo with a manually edited file.'
    );
  }
  await fs.writeFile(GEO_OUT, JSON.stringify(filteredGeo));
  const geoSize = (await fs.stat(GEO_OUT)).size;
  console.log(
    `✓ Wrote ${GEO_OUT} (${(geoSize / 1024).toFixed(0)} KB, ${filteredGeo.features.length} features)`
  );

  // Summary
  const matchedZips = filteredGeo.features.length;
  if (matchedZips < zipCount) {
    console.warn(
      `Note: ${zipCount - matchedZips} zips have ZHVI data but no GeoJSON polygon ` +
        `(probably PO box or non-residential ZCTAs). They will not appear on the map.`
    );
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
