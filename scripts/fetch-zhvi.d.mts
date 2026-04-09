// Type declarations for scripts/fetch-zhvi.mjs so TypeScript callers
// (the unit test and any future TypeScript importers) get proper types
// for the exported helper functions. The .mjs runtime is still the
// canonical source — this file just describes its shape.

export interface ZhviSeriesPoint {
  date: string;
  value: number;
}

export interface ZhviParseResult {
  lastDataMonth: string | null;
  zips: Record<string, ZhviSeriesPoint[]>;
}

export interface ZhviParseOptions {
  city?: string;
  metro?: string;
  county?: string;
  historyMonths?: number;
}

export function parseZhviCsv(csv: string, opts?: ZhviParseOptions): ZhviParseResult;

export interface CityZhviParseOptions {
  cityName?: string;
  stateCode?: string;
  historyMonths?: number;
}

export function parseCityZhviCsv(
  csv: string,
  opts?: CityZhviParseOptions
): ZhviSeriesPoint[];

// Loose types — filterGeoJsonByZips does runtime validation. The function
// accepts any object that looks like a GeoJSON FeatureCollection and
// returns a normalized one with `properties.zip` populated. We use `any`
// here so the test fixtures don't have to fight TypeScript's literal-string
// widening for the `type` discriminator.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filterGeoJsonByZips(geojson: any, allowedZips: string[]): {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any> & { zip: string };
    geometry: unknown;
  }>;
};
