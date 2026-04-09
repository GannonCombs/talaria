'use client';

import { useState, useEffect, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Polygon,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import {
  AUSTIN_CENTER,
  DEFAULT_ZOOM,
} from '@/lib/modules/housing/geodata';
import { findNearestPinId } from '@/lib/modules/housing/pin-hittest';

interface ListingPin {
  id: number;
  address: string;
  zip: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  dealScore: number | null;
  monthlyCost: number | null;
  latitude: number;
  longitude: number;
}

interface IsochroneAddress {
  id: string;
  label: string;
  lat: number;
  lng: number;
  color: string;
}

interface IsoPolygon {
  id: string;
  color: string;
  label: string;
  polygon: [number, number][];
  driveMinutes?: number;
}

interface HousingMapProps {
  listings: ListingPin[];
  isochroneAddresses: IsochroneAddress[];
  isoPolygons?: IsoPolygon[];
  isoIntersection?: [number, number][][];
  onListingClick?: (id: number) => void;
  // Round 4: zip-code price trend heat map. Visibility toggle is owned by
  // the parent (housing page) so the LeftPanel section can read the same
  // state. The period itself is set in LeftPanel — HousingMap only reads it.
  showPriceTrends: boolean;
  onShowPriceTrendsChange: (v: boolean) => void;
  priceTrendMonths: number;
}

// Round 4: Zillow ZHVI artifact shape (matches scripts/fetch-zhvi.mjs output)
interface ZhviSeries {
  date: string;
  value: number;
}
interface ZhviData {
  fetchedAt: string;
  lastDataMonth: string;
  metro: string;
  zips: Record<string, ZhviSeries[]>;
}

// Pin color. Two options kept around so we can toggle without re-picking:
//   PIN_COLOR_TEAL — Talaria primary. Clashes with the mint isochrone color
//                    but is unmistakably "the brand" and pops on dark map.
//   PIN_COLOR_SKY  — sky-400. Cooler, more distinct from isochrones, but
//                    shades closer to the (future) flood-zone overlay blue.
const PIN_COLOR_TEAL = '#46f1c5';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Kept on user request as a quick swap target.
const PIN_COLOR_SKY = '#38bdf8';
const PIN_COLOR = PIN_COLOR_TEAL;

function getPinRadius(dealScore: number | null): number {
  // Slightly larger than the SVG-mode default (was 6) to compensate for
  // canvas anti-aliasing — small canvas circles look fuzzier than small
  // SVG circles, so a couple extra pixels per pin restores the polished
  // look without affecting click hit-testing (the delegated handler uses
  // its own grace radius).
  if (dealScore === null) return 7;
  return 6 + (dealScore / 100) * 4;
}

// Map controls
function MapControls({
  showPriceTrends,
  setShowPriceTrends,
  showIsochrones,
  setShowIsochrones,
  showFloodZones,
  setShowFloodZones,
}: {
  showPriceTrends: boolean;
  setShowPriceTrends: (v: boolean) => void;
  showIsochrones: boolean;
  setShowIsochrones: (v: boolean) => void;
  showFloodZones: boolean;
  setShowFloodZones: (v: boolean) => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-surface-container border border-outline p-3 space-y-2">
      <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={showPriceTrends}
          onChange={(e) => setShowPriceTrends(e.target.checked)}
          className="accent-primary"
        />
        Price Trends
      </label>
      <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={showIsochrones}
          onChange={(e) => setShowIsochrones(e.target.checked)}
          className="accent-primary"
        />
        Isochrones
      </label>
      <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={showFloodZones}
          onChange={(e) => setShowFloodZones(e.target.checked)}
          className="accent-primary"
        />
        Flood Zones
      </label>
    </div>
  );
}

function MapResizer() {
  const map = useMap();
  setTimeout(() => map.invalidateSize(), 100);
  return null;
}

// Delegated map-level click handler. Canvas-mode CircleMarkers don't
// reliably fire per-marker click events in react-leaflet 5 + leaflet
// 1.9, and even when they do the hit boxes are exactly the visual
// circle (no padding), so users miss tiny pins constantly. We solve
// both by listening on the map itself and finding the nearest pin
// within a small grace radius. Reads listings + onListingClick from
// refs so the handler closure stays valid across re-renders.
const PIN_GRACE_PX = 12;

function ListingClickHandler({
  listings,
  onListingClick,
}: {
  listings: ListingPin[];
  onListingClick?: (id: number) => void;
}) {
  const listingsRef = useRef(listings);
  const onListingClickRef = useRef(onListingClick);

  useEffect(() => {
    listingsRef.current = listings;
  }, [listings]);

  useEffect(() => {
    onListingClickRef.current = onListingClick;
  }, [onListingClick]);

  useMapEvents({
    click(e) {
      const map = e.target;
      const clickPoint = map.latLngToContainerPoint(e.latlng);
      // 12px grace ≈ twice the visual pin radius (6-7px). Generous
      // enough for near-misses, tight enough that two overlapping
      // pins still resolve to the closer one.
      const pins = listingsRef.current
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => {
          const p = map.latLngToContainerPoint([l.latitude, l.longitude]);
          return { id: l.id, x: p.x, y: p.y };
        });
      const hitId = findNearestPinId(clickPoint.x, clickPoint.y, pins, PIN_GRACE_PX);
      if (hitId !== null) {
        onListingClickRef.current?.(hitId);
      }
    },
  });

  return null;
}

// ── Round 4: Zip-code price trend heat map helpers ─────────────────────────

// Divergent palette keyed to Talaria's accent tokens.
//   <= -10%   → deep red (#e5534b)
//   <    0%   → light red (linear interpolation toward neutral)
//   ≈    0%   → neutral gray (#30363d)
//   >    0%   → light green (linear interpolation toward deep green)
//   >= +10%   → deep green (#3fb950)
function colorForPct(pct: number): string {
  const clamped = Math.max(-0.10, Math.min(0.10, pct));
  const t = (clamped + 0.10) / 0.20; // 0..1, with 0.5 = neutral
  // Three stops: red (#e5534b) → gray (#30363d) → green (#3fb950)
  const stops = [
    { t: 0, r: 0xe5, g: 0x53, b: 0x4b },
    { t: 0.5, r: 0x30, g: 0x36, b: 0x3d },
    { t: 1, r: 0x3f, g: 0xb9, b: 0x50 },
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const localT = (t - lo.t) / (hi.t - lo.t || 1);
  const r = Math.round(lo.r + (hi.r - lo.r) * localT);
  const g = Math.round(lo.g + (hi.g - lo.g) * localT);
  const b = Math.round(lo.b + (hi.b - lo.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

// Build a Leaflet style function for the zip GeoJSON layer. Closes over the
// loaded ZHVI data and the active period (in months). Each feature looks up
// its zip in the ZHVI map, computes the % change over the period, and gets
// a fill color from the divergent palette.
function zipStyleFor(zhvi: ZhviData | null, monthsBack: number) {
  return (feature?: { properties?: { zip?: string } }): Record<string, unknown> => {
    if (!zhvi || !feature?.properties?.zip) {
      return { color: '#30363d', weight: 0.6, fillColor: '#1c2128', fillOpacity: 0.1 };
    }
    const series = zhvi.zips[feature.properties.zip];
    if (!series || series.length < monthsBack + 1) {
      // Not enough history for this zip — render as a quiet outline so
      // the geographic context is still there but the color isn't misleading.
      return { color: '#30363d', weight: 0.6, fillColor: '#1c2128', fillOpacity: 0.1 };
    }
    const latest = series[series.length - 1].value;
    const past = series[series.length - 1 - monthsBack].value;
    const pct = (latest - past) / past;
    // 0.4 fillOpacity reads as a tint over the basemap rather than a
    // paint job, so the listing pins remain clearly visible on top.
    return {
      color: '#3a4350',
      weight: 0.7,
      fillColor: colorForPct(pct),
      fillOpacity: 0.4,
    };
  };
}

// Look up the % change for a single zip + period. Returns null if no data.
function pctChangeFor(zhvi: ZhviData | null, zip: string, monthsBack: number): number | null {
  if (!zhvi) return null;
  const series = zhvi.zips[zip];
  if (!series || series.length < monthsBack + 1) return null;
  const latest = series[series.length - 1].value;
  const past = series[series.length - 1 - monthsBack].value;
  return (latest - past) / past;
}

// Format a number of months as a human-readable label ("1 month",
// "12 months", "1 year", "5 years"). Used in tooltips and the LeftPanel.
export function formatPeriod(months: number): string {
  if (months === 1) return '1 month';
  if (months < 12) return `${months} months`;
  if (months === 12) return '1 year';
  if (months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}

// Format a percentage with sign for tooltips: "+5.2%" / "−5.2%" / "0.0%"
function formatPct(pct: number): string {
  const v = (pct * 100).toFixed(1);
  if (pct > 0) return `+${v}%`;
  if (pct < 0) return `${v}%`; // already has the minus
  return `${v}%`;
}

export default function HousingMap({
  listings,
  isochroneAddresses,
  isoPolygons = [],
  isoIntersection,
  onListingClick,
  showPriceTrends,
  onShowPriceTrendsChange,
  priceTrendMonths,
}: HousingMapProps) {
  const [showIsochrones, setShowIsochrones] = useState(false);
  const [showFloodZones, setShowFloodZones] = useState(false);
  const [zipGeoData, setZipGeoData] = useState<FeatureCollection | null>(null);
  const [zhviData, setZhviData] = useState<ZhviData | null>(null);
  const [floodData, setFloodData] = useState<FeatureCollection | null>(null);

  // Round 4: load the zip polygons + ZHVI artifact in parallel. Both are
  // generated by `node scripts/fetch-zhvi.mjs` and committed to public/.
  // Failures are silent — if either fails, the heat map just doesn't render
  // (the rest of the map still works).
  useEffect(() => {
    fetch('/austin-zips.geojson')
      .then((r) => r.json())
      .then(setZipGeoData)
      .catch(() => {});
    fetch('/austin-zhvi.json')
      .then((r) => r.json())
      .then(setZhviData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (showFloodZones && !floodData) {
      fetch('/austin-flood-zones.geojson')
        .then((r) => r.json())
        .then(setFloodData)
        .catch(() => {});
    }
  }, [showFloodZones, floodData]);

  // Gate the MapContainer on listings being populated. Otherwise on cold
  // direct-load, MapContainer mounts with an empty pin array, and when
  // listings populates a moment later the new CircleMarkers attach
  // event handlers during a later commit cycle that doesn't always
  // succeed. Forcing MapContainer to wait until pins exist guarantees
  // every marker's click handler is registered during the initial mount.
  if (listings.length === 0) {
    return (
      <div className="relative w-full h-full bg-surface flex items-center justify-center">
        <div className="text-on-surface-variant text-sm font-mono">
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <MapControls
        showPriceTrends={showPriceTrends}
        setShowPriceTrends={onShowPriceTrendsChange}
        showIsochrones={showIsochrones}
        setShowIsochrones={setShowIsochrones}
        showFloodZones={showFloodZones}
        setShowFloodZones={setShowFloodZones}
      />

      <MapContainer
        center={AUSTIN_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full"
        style={{ background: '#0d1117' }}
        zoomControl={false}
        // Render all vector layers (CircleMarkers, GeoJSON polygons) to a
        // single <canvas> instead of individual SVG nodes. With ~5k pins
        // plus the zip-code price-trend polygons, SVG mode produces a
        // multi-thousand-node DOM that the browser can't lay out fast — the
        // main thread is blocked for 30+ seconds on initial render and
        // every interaction (including click handler attachment) is
        // queued behind it. Canvas mode collapses all of that into one
        // GPU-accelerated draw call.
        preferCanvas={true}
      >
        <MapResizer />
        <ListingClickHandler listings={listings} onListingClick={onListingClick} />

        <TileLayer
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://stadiamaps.com/">Stadia</a>'
        />

        {/* Round 4: zip-code price-trend heat map. Polygons are colored
            by the % change in Zillow Home Value Index over the active
            period (set in the LeftPanel Price Trends section). The `key`
            prop forces a remount when the period or visibility changes —
            Leaflet caches style functions and won't recompute fills
            otherwise. */}
        {showPriceTrends && zipGeoData && zhviData && (
          <GeoJSON
            key={`zhvi-${priceTrendMonths}`}
            data={zipGeoData}
            style={zipStyleFor(zhviData, priceTrendMonths)}
            // The `key` above forces a remount on every period change so
            // styles recompute. But in canvas-renderer mode, re-adding the
            // layer puts it on top of the listing pins (canvas draw order
            // is insertion order). bringToBack on the `add` event keeps
            // the heat map below the pins on every remount.
            eventHandlers={{
              add: (e) => {
                const layer = e.target as { bringToBack?: () => void };
                layer.bringToBack?.();
              },
            }}
            onEachFeature={(feature, layer) => {
              const zip = feature?.properties?.zip;
              if (!zip) return;
              const series = zhviData.zips[zip];
              const latest = series?.[series.length - 1]?.value;
              const pct = pctChangeFor(zhviData, zip, priceTrendMonths);
              const lines = [`<strong>${zip}</strong>`];
              if (latest != null) {
                lines.push(`$${Math.round(latest).toLocaleString()}`);
              }
              if (pct != null) {
                lines.push(`${formatPeriod(priceTrendMonths)}: ${formatPct(pct)}`);
              } else {
                lines.push(`${formatPeriod(priceTrendMonths)}: no data`);
              }
              layer.bindTooltip(lines.join('<br/>'), {
                sticky: true,
                className: '!bg-surface-container !border-outline !text-on-surface !text-xs !rounded-none !shadow-none',
              });
            }}
          />
        )}

        {/* Flood zones */}
        {showFloodZones && floodData && (
          <GeoJSON
            data={floodData}
            style={() => ({
              color: '#60a5fa',
              weight: 1.5,
              fillColor: '#3b82f6',
              fillOpacity: 0.35,
            })}
          />
        )}

        {/* Isochrone polygons + center dots */}
        {showIsochrones && (
          <>
            {/* Drive-time boundary polygons */}
            {isoPolygons.map((iso) => (
              <Polygon
                key={`poly-${iso.id}`}
                positions={iso.polygon}
                pathOptions={{
                  color: iso.color,
                  weight: 2,
                  dashArray: '8 4',
                  fillColor: iso.color,
                  fillOpacity: 0.06,
                }}
              >
                <Tooltip
                  className="!bg-surface-container !border-outline !text-on-surface !text-xs !rounded-none !shadow-none"
                >
                  {iso.label} — {iso.driveMinutes ?? 30} min
                </Tooltip>
              </Polygon>
            ))}

            {/* Intersection of all isochrones */}
            {isoIntersection && isoIntersection.map((ring, i) => (
              <Polygon
                key={`intersection-${i}`}
                positions={ring}
                pathOptions={{
                  color: '#ffffff',
                  weight: 2,
                  fillColor: '#ffffff',
                  fillOpacity: 0.2,
                }}
              >
                <Tooltip className="!bg-surface-container !border-outline !text-on-surface !text-xs !rounded-none !shadow-none">
                  Overlap — reachable from all locations
                </Tooltip>
              </Polygon>
            ))}

            {/* Center dots */}
            {isochroneAddresses
              .filter((a) => a.lat !== 0 && a.lng !== 0)
              .map((addr) => (
                <CircleMarker
                  key={`dot-${addr.id}`}
                  center={[addr.lat, addr.lng]}
                  radius={6}
                  pathOptions={{
                    color: addr.color,
                    fillColor: addr.color,
                    fillOpacity: 1,
                    weight: 2,
                  }}
                >
                  <Tooltip
                    className="!bg-surface-container !border-outline !text-on-surface !text-xs !rounded-none !shadow-none"
                  >
                    {addr.label || 'Unnamed'}
                  </Tooltip>
                </CircleMarker>
              ))
            }
          </>
        )}

        {/* Listing pins. Click handling is delegated to ListingClickHandler
            above — per-marker handlers are unreliable in canvas mode. */}
        {listings.map((listing) => (
          <CircleMarker
            key={listing.id}
            center={[listing.latitude, listing.longitude]}
            radius={getPinRadius(listing.dealScore)}
            pathOptions={{
              color: '#ffffff',
              fillColor: PIN_COLOR,
              fillOpacity: 1,
              weight: 1.5,
            }}
          >
            <Tooltip
              className="!bg-surface-container !border-outline !text-on-surface !text-xs !rounded-none !shadow-none"
            >
              <div className="font-sans">
                <strong>{listing.address}</strong>
                <br />
                <span className="font-mono">
                  ${listing.price.toLocaleString()}
                </span>
                {listing.dealScore !== null && (
                  <>
                    <br />
                    Score: {listing.dealScore}
                  </>
                )}
                <br />
                {listing.beds ?? '?'}bd / {listing.baths ?? '?'}ba / {listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : 'sqft unknown'}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
