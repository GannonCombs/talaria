'use client';

import { useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polygon,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ZIP_BOUNDARIES,
  ISOCHRONE_JOLLYVILLE,
  ISOCHRONE_DOWNTOWN,
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

type ColorByMode = 'score' | 'price' | 'monthly';

interface HousingMapProps {
  neighborhoods: NeighborhoodScore[];
  listings: ListingPin[];
  onListingClick?: (id: number) => void;
}

function scoreToColor(score: number): string {
  // Teal gradient: low score = dim, high score = bright
  const intensity = Math.round((score / 100) * 200 + 55);
  return `rgba(70, 241, 197, ${(intensity / 255).toFixed(2)})`;
}

function priceToColor(price: number): string {
  // Green (cheap) to red (expensive)
  const ratio = Math.min(1, price / 700000);
  const r = Math.round(ratio * 255);
  const g = Math.round((1 - ratio) * 200);
  return `rgba(${r}, ${g}, 100, 0.5)`;
}

function getPolygonColor(
  n: NeighborhoodScore,
  mode: ColorByMode
): string {
  switch (mode) {
    case 'score':
      return scoreToColor(n.compositeScore);
    case 'price':
      return priceToColor(n.medianPrice);
    case 'monthly':
      return priceToColor(n.medianPrice * 0.006); // rough monthly proxy
    default:
      return scoreToColor(n.compositeScore);
  }
}

function getPinColor(dealScore: number | null): string {
  if (dealScore === null) return '#8b949e';
  if (dealScore >= 85) return '#fbab29'; // amber for high-score
  return '#46f1c5'; // teal for normal
}

function getPinRadius(dealScore: number | null): number {
  if (dealScore === null) return 5;
  return 4 + (dealScore / 100) * 4; // 4-8px based on score
}

// Controls overlay component
function MapControls({
  colorBy,
  setColorBy,
  showPolygons,
  setShowPolygons,
  showIsochrones,
  setShowIsochrones,
}: {
  colorBy: ColorByMode;
  setColorBy: (m: ColorByMode) => void;
  showPolygons: boolean;
  setShowPolygons: (v: boolean) => void;
  showIsochrones: boolean;
  setShowIsochrones: (v: boolean) => void;
}) {
  return (
    <div className="absolute top-4 right-4 z-[1000] bg-surface-container border border-outline p-3 space-y-3">
      <div>
        <label className="section-header text-[9px] text-on-surface-variant block mb-1">
          Color By
        </label>
        <select
          value={colorBy}
          onChange={(e) => setColorBy(e.target.value as ColorByMode)}
          className="w-full bg-surface-container-lowest border border-outline text-xs px-2 py-1 text-on-surface focus:border-primary focus:outline-none"
        >
          <option value="score">Personal Score</option>
          <option value="price">Median Price</option>
          <option value="monthly">Est. Monthly</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={showPolygons}
          onChange={(e) => setShowPolygons(e.target.checked)}
          className="accent-primary"
        />
        Zip Polygons
      </label>
      <label className="flex items-center gap-2 text-[10px] text-on-surface-variant cursor-pointer">
        <input
          type="checkbox"
          checked={showIsochrones}
          onChange={(e) => setShowIsochrones(e.target.checked)}
          className="accent-primary"
        />
        Isochrones
      </label>
    </div>
  );
}

// Invalidate map size when container changes
function MapResizer() {
  const map = useMap();
  setTimeout(() => map.invalidateSize(), 100);
  return null;
}

export default function HousingMap({
  neighborhoods,
  listings,
  onListingClick,
}: HousingMapProps) {
  const [colorBy, setColorBy] = useState<ColorByMode>('score');
  const [showPolygons, setShowPolygons] = useState(true);
  const [showIsochrones, setShowIsochrones] = useState(true);

  const neighborhoodMap = new Map(neighborhoods.map((n) => [n.zip, n]));

  return (
    <div className="relative w-full h-full">
      <MapControls
        colorBy={colorBy}
        setColorBy={setColorBy}
        showPolygons={showPolygons}
        setShowPolygons={setShowPolygons}
        showIsochrones={showIsochrones}
        setShowIsochrones={setShowIsochrones}
      />

      <MapContainer
        center={AUSTIN_CENTER}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full"
        style={{ background: '#0d1117' }}
        zoomControl={false}
      >
        <MapResizer />

        {/* Dark tile layer — CartoDB dark_matter (free, no token) */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          className="brightness-[1.6]"
        />

        {/* Neighborhood polygons */}
        {showPolygons &&
          Object.entries(ZIP_BOUNDARIES).map(([zip, coords]) => {
            const n = neighborhoodMap.get(zip);
            const color = n
              ? getPolygonColor(n, colorBy)
              : 'rgba(70, 241, 197, 0.1)';
            return (
              <Polygon
                key={zip}
                positions={coords}
                pathOptions={{
                  color: '#46f1c5',
                  weight: 1,
                  fillColor: color,
                  fillOpacity: 0.35,
                }}
              >
                <Tooltip
                  className="!bg-surface-container !border-outline !text-on-surface !text-xs !font-mono !rounded-none !shadow-none"
                >
                  <div>
                    <strong>{zip}</strong>
                    {n && (
                      <>
                        <br />Score: {n.compositeScore}
                        <br />Median: ${n.medianPrice.toLocaleString()}
                      </>
                    )}
                  </div>
                </Tooltip>
              </Polygon>
            );
          })}

        {/* Isochrone boundaries */}
        {showIsochrones && (
          <>
            <Polyline
              positions={[...ISOCHRONE_JOLLYVILLE, ISOCHRONE_JOLLYVILLE[0]]}
              pathOptions={{
                color: '#46f1c5',
                weight: 2,
                dashArray: '8 4',
                opacity: 0.6,
              }}
            />
            <Polyline
              positions={[...ISOCHRONE_DOWNTOWN, ISOCHRONE_DOWNTOWN[0]]}
              pathOptions={{
                color: '#fbab29',
                weight: 2,
                dashArray: '8 4',
                opacity: 0.6,
              }}
            />
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
                {listing.monthlyCost && (
                  <>
                    <br />
                    <span className="font-mono text-[10px]">
                      ${listing.monthlyCost.toLocaleString()}/mo
                    </span>
                  </>
                )}
                {listing.dealScore !== null && (
                  <>
                    <br />
                    Deal Score: {listing.dealScore}
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
