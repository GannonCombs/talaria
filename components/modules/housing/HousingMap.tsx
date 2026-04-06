'use client';

import { useState, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  CircleMarker,
  Polygon,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import {
  AUSTIN_CENTER,
  DEFAULT_ZOOM,
} from '@/lib/modules/housing/geodata';

interface NeighborhoodScore {
  zip: string;
  compositeScore: number;
  medianPrice: number;
  walkScore: number;
}

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
  neighborhoods: NeighborhoodScore[];
  listings: ListingPin[];
  isochroneAddresses: IsochroneAddress[];
  isoPolygons?: IsoPolygon[];
  isoIntersection?: [number, number][][];
  onListingClick?: (id: number) => void;
}

function getPinColor(dealScore: number | null): string {
  if (dealScore === null) return '#8b949e';
  if (dealScore >= 85) return '#fbab29';
  return '#46f1c5';
}

function getPinRadius(dealScore: number | null): number {
  if (dealScore === null) return 5;
  return 4 + (dealScore / 100) * 4;
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
  neighborhoods,
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
      >
        <MapResizer />

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

        {/* Listing pins */}
        {listings.map((listing) => (
          <CircleMarker
            key={listing.id}
            center={[listing.latitude, listing.longitude]}
            radius={getPinRadius(listing.dealScore)}
            pathOptions={{
              color: getPinColor(listing.dealScore),
              fillColor: getPinColor(listing.dealScore),
              fillOpacity: 0.8,
              weight: 1,
            }}
            eventHandlers={{
              click: () => onListingClick?.(listing.id),
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
                {listing.beds}bd / {listing.baths}ba / {listing.sqft.toLocaleString()} sqft
              </div>
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
