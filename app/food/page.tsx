'use client';

import { useState } from 'react';
import BackButton from '@/components/layout/BackButton';

interface VenueHit {
  id: { resy: number };
  name: string;
  cuisine: string[];
  price_range_id: number;
  rating: { average: number; count: number };
  neighborhood: string;
  location: { name: string };
  url_slug: string;
  content: Array<{ body: string; name: string }>;
}

interface TimeSlot {
  date: { start: string; end: string };
  config: { type: string; token: string };
}

interface VenueResult {
  venue: VenueHit;
  slots: TimeSlot[];
}

export default function FoodPage() {
  const [venues, setVenues] = useState<VenueResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState<number | null>(null);
  const [availability, setAvailability] = useState<Record<number, TimeSlot[]>>({});

  const today = new Date().toISOString().split('T')[0];

  async function searchVenues() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/food/search?lat=30.2672&long=-97.7431&day=${today}&party_size=2`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      // Resy /3/venuesearch/search returns { search: { hits: [...] } }
      const hits: VenueHit[] = data?.search?.hits ?? [];
      const results: VenueResult[] = hits.map((h) => ({ venue: h, slots: [] }));
      setVenues(results);
      if (results.length === 0) {
        setError('No venues found. Resy may not have results for this area.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function checkAvailability(venueId: number) {
    setAvailabilityLoading(venueId);
    try {
      const res = await fetch(
        `/api/food/availability?venue_id=${venueId}&lat=30.2672&long=-97.7431&day=${today}&party_size=2`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      const slots = data?.results?.venues?.[0]?.slots ?? [];
      setAvailability((prev) => ({ ...prev, [venueId]: slots }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAvailabilityLoading(null);
    }
  }

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <BackButton />
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">
            Food
          </h1>
        </div>
      </div>

      <div className="max-w-2xl">
        <button
          onClick={searchVenues}
          disabled={loading}
          className="bg-primary text-on-primary px-6 py-3 text-sm font-medium hover:brightness-110 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search Restaurants — Austin'}
        </button>

        <p className="text-xs text-on-surface-variant mt-2">
          Party size: 2 · Date: {today} · Austin, TX
        </p>

        {error && (
          <div className="mt-4 p-4 border border-error/50 bg-error/10 text-error text-sm">
            {error}
          </div>
        )}

        {venues.length > 0 && (
          <div className="mt-4 space-y-3">
            {venues.map((v) => {
              const venue = v.venue;
              const venueId = venue.id.resy;
              const slots = availability[venueId];
              return (
                <div
                  key={venueId}
                  className="bg-surface-container-low border border-outline p-5"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-sm font-bold text-on-surface">
                        {venue.name}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5">
                        {(Array.isArray(venue.cuisine) ? venue.cuisine : [venue.cuisine]).filter(Boolean).join(', ')}
                        {' · '}{'$'.repeat(venue.price_range_id || 1)}
                        {venue.neighborhood ? ` · ${venue.neighborhood}` : ''}
                        {venue.rating?.average ? ` · ${venue.rating.average.toFixed(1)}★` : ''}
                      </div>
                    </div>
                    <button
                      onClick={() => checkAvailability(venueId)}
                      disabled={availabilityLoading === venueId}
                      className="text-xs border border-outline px-3 py-1.5 text-on-surface hover:border-primary disabled:opacity-50 shrink-0"
                    >
                      {availabilityLoading === venueId ? 'Loading...' : 'Check Availability'}
                    </button>
                  </div>

                  {v.slots && v.slots.length > 0 && !slots && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {v.slots.slice(0, 8).map((slot, i) => {
                        const time = new Date(slot.date.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                        return (
                          <span key={i} className="text-xs font-mono bg-surface-container-highest px-2 py-1 text-on-surface-variant">
                            {time}
                          </span>
                        );
                      })}
                      {v.slots.length > 8 && (
                        <span className="text-xs text-on-surface-variant px-2 py-1">
                          +{v.slots.length - 8} more
                        </span>
                      )}
                    </div>
                  )}

                  {slots && (
                    <div className="mt-2">
                      {slots.length === 0 ? (
                        <div className="text-xs text-on-surface-variant">No availability for this date</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {slots.slice(0, 12).map((slot, i) => {
                            const time = new Date(slot.date.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                            const type = slot.config?.type ?? '';
                            return (
                              <span key={i} className="text-xs font-mono bg-primary/10 border border-primary/30 px-2 py-1 text-primary">
                                {time}{type ? ` · ${type}` : ''}
                              </span>
                            );
                          })}
                          {slots.length > 12 && (
                            <span className="text-xs text-on-surface-variant px-2 py-1">
                              +{slots.length - 12} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
