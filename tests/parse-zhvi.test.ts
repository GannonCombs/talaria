import { describe, it, expect } from 'vitest';
import { parseZhviCsv, filterGeoJsonByZips, parseCityZhviCsv } from '../scripts/fetch-zhvi.mjs';

describe('parseZhviCsv', () => {
  // Synthetic ZHVI CSV mimicking Zillow's real format. Three zips:
  //   78704 = Austin metro (should pass)
  //   78745 = Austin metro (should pass)
  //   75201 = Dallas (should be filtered out)
  // Three monthly date columns.
  const csv = [
    'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-01-31,2026-02-28,2026-03-31',
    '91940,1,78704,zip,Texas,TX,Austin,"Austin-Round Rock-Georgetown, TX",Travis County,1100000,1130000,1158819',
    '91941,2,78745,zip,Texas,TX,Austin,"Austin-Round Rock-Georgetown, TX",Travis County,520000,530000,541097',
    '91950,3,75201,zip,Texas,TX,Dallas,"Dallas-Fort Worth-Arlington, TX",Dallas County,800000,810000,820000',
  ].join('\n');

  it('parses Austin zips and skips Dallas', () => {
    const result = parseZhviCsv(csv);
    expect(Object.keys(result.zips).sort()).toEqual(['78704', '78745']);
    expect(result.lastDataMonth).toBe('2026-03-31');
  });

  it('returns the time series in chronological order with full values', () => {
    const result = parseZhviCsv(csv);
    expect(result.zips['78704']).toEqual([
      { date: '2026-01-31', value: 1100000 },
      { date: '2026-02-28', value: 1130000 },
      { date: '2026-03-31', value: 1158819 },
    ]);
  });

  it('handles quoted Metro field with embedded comma correctly', () => {
    // The Austin metro string has a comma inside the quoted field. Our
    // CSV splitter must respect the quotes — otherwise the metro filter
    // would mismatch and we'd lose every Austin zip.
    const result = parseZhviCsv(csv);
    expect(Object.keys(result.zips).length).toBe(2);
  });

  it('skips blank/invalid values in the time series', () => {
    const csvWithBlanks = [
      'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-01-31,2026-02-28,2026-03-31',
      '91940,1,78704,zip,Texas,TX,Austin,"Austin-Round Rock-Georgetown, TX",Travis County,,1130000,1158819',
      '91941,2,78745,zip,Texas,TX,Austin,"Austin-Round Rock-Georgetown, TX",Travis County,520000,,541097',
    ].join('\n');
    const result = parseZhviCsv(csvWithBlanks);
    expect(result.zips['78704']).toEqual([
      { date: '2026-02-28', value: 1130000 },
      { date: '2026-03-31', value: 1158819 },
    ]);
    expect(result.zips['78745']).toEqual([
      { date: '2026-01-31', value: 520000 },
      { date: '2026-03-31', value: 541097 },
    ]);
  });

  it('trims to historyMonths most recent columns', () => {
    const result = parseZhviCsv(csv, { historyMonths: 2 });
    expect(result.zips['78704']).toEqual([
      { date: '2026-02-28', value: 1130000 },
      { date: '2026-03-31', value: 1158819 },
    ]);
  });

  it('falls back to metro filter if city filter matches zero rows', () => {
    // City="Pflugerville" — won't match the default city filter ("Austin"),
    // so we expect to fall through to the metro filter and still pick the
    // rows up via Metro="Austin-Round Rock-Georgetown, TX".
    const csvWrongCity = [
      'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-03-31',
      '91960,1,78660,zip,Texas,TX,Pflugerville,"Austin-Round Rock-Georgetown, TX",Travis County,420000',
      '91961,2,78664,zip,Texas,TX,Round Rock,"Austin-Round Rock-Georgetown, TX",Williamson County,380000',
    ].join('\n');
    const result = parseZhviCsv(csvWrongCity);
    expect(Object.keys(result.zips).sort()).toEqual(['78660', '78664']);
  });

  it('falls back to county filter if both city and metro filters match zero rows', () => {
    // Neither City="Austin" nor Metro="Austin-Round Rock-Georgetown, TX"
    // matches. Should still find the rows by CountyName="Travis County".
    const csvWrongMetro = [
      'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-03-31',
      '91940,1,78704,zip,Texas,TX,SomeOtherCity,"Some-Renamed-Metro, TX",Travis County,1158819',
      '91941,2,78745,zip,Texas,TX,SomeOtherCity,"Some-Renamed-Metro, TX",Travis County,541097',
    ].join('\n');
    const result = parseZhviCsv(csvWrongMetro);
    expect(Object.keys(result.zips).sort()).toEqual(['78704', '78745']);
  });

  it('handles CRLF line endings', () => {
    const csvCrlf = csv.replace(/\n/g, '\r\n');
    const result = parseZhviCsv(csvCrlf);
    expect(Object.keys(result.zips).length).toBe(2);
  });

  it('returns empty result when given only a header row', () => {
    const headerOnly =
      'RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName,2026-03-31';
    expect(parseZhviCsv(headerOnly)).toEqual({ lastDataMonth: null, zips: {} });
  });
});

describe('parseCityZhviCsv', () => {
  // Synthetic City CSV. The schema differs from the Zip CSV: there is no
  // City column (the City IS the RegionName), and RegionType is "city".
  const csv = [
    'RegionID,SizeRank,RegionName,RegionType,StateName,State,Metro,CountyName,2026-01-31,2026-02-28,2026-03-31',
    '10221,10,Austin,city,TX,TX,"Austin-Round Rock-Georgetown, TX",Travis County,505000,503000,500627',
    '23555,2142,Austin,city,MN,MN,"Austin, MN",Mower County,180000,181000,182000',
  ].join('\n');

  it('extracts the Austin TX series by default', () => {
    const result = parseCityZhviCsv(csv);
    expect(result).toEqual([
      { date: '2026-01-31', value: 505000 },
      { date: '2026-02-28', value: 503000 },
      { date: '2026-03-31', value: 500627 },
    ]);
  });

  it('disambiguates by state code (Austin MN vs Austin TX)', () => {
    const result = parseCityZhviCsv(csv, { stateCode: 'MN' });
    expect(result).toEqual([
      { date: '2026-01-31', value: 180000 },
      { date: '2026-02-28', value: 181000 },
      { date: '2026-03-31', value: 182000 },
    ]);
  });

  it('trims to historyMonths most recent columns', () => {
    const result = parseCityZhviCsv(csv, { historyMonths: 2 });
    expect(result).toEqual([
      { date: '2026-02-28', value: 503000 },
      { date: '2026-03-31', value: 500627 },
    ]);
  });

  it('returns empty array when no city matches', () => {
    expect(parseCityZhviCsv(csv, { cityName: 'Nowhere' })).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const result = parseCityZhviCsv(csv.replace(/\n/g, '\r\n'));
    expect(result.length).toBe(3);
  });
});

describe('filterGeoJsonByZips', () => {
  // Synthetic GeoJSON with three features, two of which match the
  // requested zip list.
  const geo = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { ZCTA5CE10: '78704', POP: 1000 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      },
      {
        type: 'Feature',
        properties: { ZCTA5CE10: '78745', POP: 2000 },
        geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 2]]] },
      },
      {
        type: 'Feature',
        properties: { ZCTA5CE10: '75201', POP: 5000 },
        geometry: { type: 'Polygon', coordinates: [[[10, 10], [11, 10], [11, 11], [10, 10]]] },
      },
    ],
  };

  it('keeps only features whose zip is in the allow list', () => {
    const filtered = filterGeoJsonByZips(geo, ['78704', '78745']);
    expect(filtered.features.length).toBe(2);
    expect(filtered.features.map((f: { properties: { zip: string } }) => f.properties.zip).sort()).toEqual(['78704', '78745']);
  });

  it('normalizes the property name to "zip"', () => {
    const filtered = filterGeoJsonByZips(geo, ['78704']);
    expect(filtered.features[0].properties.zip).toBe('78704');
    // Original property is still there for reference
    expect(filtered.features[0].properties.ZCTA5CE10).toBe('78704');
    // Original POP property survives
    expect(filtered.features[0].properties.POP).toBe(1000);
  });

  it('handles alternate property names (ZCTA5CE20, ZCTA5)', () => {
    const altGeo = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { ZCTA5CE20: '78704' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
        {
          type: 'Feature',
          properties: { ZCTA5: '78745' },
          geometry: { type: 'Point', coordinates: [0, 0] },
        },
      ],
    };
    const filtered = filterGeoJsonByZips(altGeo, ['78704', '78745']);
    expect(filtered.features.length).toBe(2);
    expect(filtered.features.map((f: { properties: { zip: string } }) => f.properties.zip).sort()).toEqual(['78704', '78745']);
  });

  it('returns an empty FeatureCollection when no zips match', () => {
    const filtered = filterGeoJsonByZips(geo, ['99999']);
    expect(filtered.type).toBe('FeatureCollection');
    expect(filtered.features.length).toBe(0);
  });

  it('throws on malformed input', () => {
    expect(() => filterGeoJsonByZips({} as never, ['78704'])).toThrow(/FeatureCollection/);
    expect(() => filterGeoJsonByZips({ type: 'FeatureCollection' } as never, ['78704'])).toThrow();
  });
});
