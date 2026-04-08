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
  showNeighborhoods,
  setShowNeighborhoods,
  showIsochrones,
  setShowIsochrones,
  showFloodZones,
  setShowFloodZones,
}: {
  showNeighborhoods: boolean;
  setShowNeighborhoods: (v: boolean) => void;
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
          checked={showNeighborhoods}
          onChange={(e) => setShowNeighborhoods(e.target.checked)}
          className="accent-primary"
        />
        Neighborhoods
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

// Style each Census tract — for now, a uniform teal tint.
// Round 3 will color by price trend (green/red).
function tractStyle(): Record<string, unknown> {
  return {
    color: '#30363d',
    weight: 0.5,
    fillColor: 'transparent',
    fillOpacity: 0,
  };
}

export default function HousingMap({
  listings,
  isochroneAddresses,
  isoPolygons = [],
  isoIntersection,
  onListingClick,
}: HousingMapProps) {
  const [showNeighborhoods, setShowNeighborhoods] = useState(true);
  const [showIsochrones, setShowIsochrones] = useState(false);
  const [showFloodZones, setShowFloodZones] = useState(false);
  const [tractData, setTractData] = useState<FeatureCollection | null>(null);
  const [floodData, setFloodData] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    fetch('/travis-tracts.geojson')
      .then((r) => r.json())
      .then(setTractData)
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
        showNeighborhoods={showNeighborhoods}
        setShowNeighborhoods={setShowNeighborhoods}
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
        // plus thousands of Census tract polylines, SVG mode produces a
        // ~10k-node DOM that the browser can't lay out fast enough — the
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

        {/* Census tract boundaries */}
        {showNeighborhoods && tractData && (
          <GeoJSON
            data={tractData}
            style={tractStyle}
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
