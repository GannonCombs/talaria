import { describe, it, expect } from 'vitest';
import { estimateCost } from '@/lib/security/costs';

describe('estimateCost', () => {
  it('returns RentCast cost for RentCast URLs', () => {
    expect(estimateCost('https://rentcast.mpp.paywithlocus.com/rentcast/sale-listings')).toBe(0.033);
    expect(estimateCost('https://rentcast.mpp.paywithlocus.com/rentcast/value-estimate')).toBe(0.033);
  });

  it('returns Mapbox geocode cost', () => {
    expect(estimateCost('https://mapbox.mpp.paywithlocus.com/mapbox/geocode-forward')).toBe(0.00375);
  });

  it('returns Mapbox isochrone cost', () => {
    expect(estimateCost('https://mapbox.mpp.paywithlocus.com/mapbox/isochrone?lat=30')).toBe(0.005);
  });

  it('returns Google Maps cost', () => {
    expect(estimateCost('https://googlemaps.mpp.tempo.xyz/maps/streetview?size=600x400')).toBe(0.01);
  });

  it('returns local mpp-reseller cost', () => {
    expect(estimateCost('http://127.0.0.1:8787/quote?symbol=AAPL')).toBe(0.001);
    expect(estimateCost('http://127.0.0.1:8787/resy/search?lat=30')).toBe(0.001);
  });

  it('returns default cost for unknown URLs', () => {
    expect(estimateCost('https://unknown-service.com/api/data')).toBe(0.05);
    expect(estimateCost('https://example.com')).toBe(0.05);
  });

  it('matches on substring (not exact match)', () => {
    // URL contains the pattern anywhere
    expect(estimateCost('https://rentcast.mpp.paywithlocus.com/some/other/path')).toBe(0.033);
  });

  it('returns more specific match for Mapbox endpoints', () => {
    // geocode-forward is more specific than just mapbox
    expect(estimateCost('https://mapbox.mpp.paywithlocus.com/mapbox/geocode-forward?q=Austin')).toBe(0.00375);
    expect(estimateCost('https://mapbox.mpp.paywithlocus.com/mapbox/isochrone?lat=30')).toBe(0.005);
  });
});
