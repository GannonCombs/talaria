'use client';

import { useState, useEffect, useCallback } from 'react';
import BackButton from '@/components/layout/BackButton';
import {
  Calendar, Clock, Users, UtensilsCrossed, DollarSign, Star,
  Heart, ChevronDown, X, RefreshCw,
} from 'lucide-react';
import { DEMO_MODE } from '@/lib/config';

// ── Types ──────────────────────────────────────────────────────────────────

interface Restaurant {
  id: number;
  resy_venue_id: number;
  name: string;
  cuisine: string;
  price_range: number;
  rating: number;
  neighborhood: string;
  image_url: string | null;
  resy_url: string | null;
}

interface TimeSlot {
  configToken: string;
  startTime: string;  // "16:00"
  endTime: string;
  seatingType: string;
}

interface Reservation {
  resyToken: string;
  venueName: string;
  venueId: number;
  date: string;
  time: string;
  partySize: number;
  seatingType: string;
  status: string;
}

interface Favorite {
  favorite_id: number;
  id: number;
  resy_venue_id: number;
  name: string;
  cuisine: string;
  price_range: number;
  rating: number;
  neighborhood: string;
  image_url: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CUISINES = [
  'Any', 'Japanese', 'Italian', 'Mexican', 'Steakhouse', 'Thai',
  'Seafood', 'American', 'Indian', 'Mediterranean', 'French',
  'Chinese', 'Korean', 'Vietnamese', 'Pizza', 'Cocktail Bar',
];

const PRICE_OPTIONS = [
  { label: 'Any', value: 0 },
  { label: '$', value: 1 },
  { label: '$$', value: 2 },
  { label: '$$$', value: 3 },
  { label: '$$$$', value: 4 },
];

const TIME_OPTIONS = [
  '5:00 PM', '5:30 PM', '6:00 PM', '6:30 PM', '7:00 PM',
  '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM',
];

const DATE_OPTIONS = [
  { label: 'Tonight', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'This Weekend', offset: (() => { const d = new Date().getDay(); return d <= 6 ? 6 - d : 0; })() },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function dateFromOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function timeToMinutes(time24: string): number {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
}

function filterTime(t: string): string {
  // "7:00 PM" → "19:00"
  const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return '19:00';
  let h = parseInt(match[1], 10);
  const m = match[2];
  if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}

// ── Demo data ──────────────────────────────────────────────────────────────

const DEMO_RESTAURANTS: (Restaurant & { slots: TimeSlot[] })[] = [
  {
    id: 1, resy_venue_id: 10804, name: 'Uchi', cuisine: 'Japanese',
    price_range: 4, rating: 4.8, neighborhood: 'South Lamar',
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAtVzKIwlEwF5rGvxVI-XoVvC1lFz-OE-PbbBLtwf-rcPdn1Fbw33UnreWx08PTO-Nk96WN8vmPdtqr7aBan_C8jk35cI6qJhoODeznv4jPPhdWkKygbkyCJBVGIiVgiVIXC77xP3lbkJ-4uQXM3rG6ZbEH0_L4dBAe3LmrJL3SrF9lVad4159bY4zbM8J9KNV5HJPUd62okrAC03WTHnGxauP8RHSf1JCzSdXFqU3DFBZ2H-JDMebmxM0nWX2rl_y0tUuoc5W0bbc',
    resy_url: 'https://resy.com/cities/austin-tx/venues/uchi-austin',
    slots: [
      { configToken: 'demo-1', startTime: '18:45', endTime: '20:45', seatingType: 'Dining Room' },
      { configToken: 'demo-2', startTime: '19:15', endTime: '21:15', seatingType: 'Dining Room' },
      { configToken: 'demo-3', startTime: '19:30', endTime: '21:30', seatingType: 'Dining Room' },
      { configToken: 'demo-4', startTime: '20:00', endTime: '22:00', seatingType: 'Bar' },
      { configToken: 'demo-5', startTime: '21:15', endTime: '23:15', seatingType: 'Bar' },
    ],
  },
  {
    id: 2, resy_venue_id: 999, name: 'Emmer & Rye', cuisine: 'New American',
    price_range: 3, rating: 4.7, neighborhood: 'Rainey Street',
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAQCIgOFQ2VJSmeao340Wi7LuJNCrAUSFvLswjl4JWjYo24mq4Hi999Z6nbzQxfCXVGmJP8YuqnVh9XWpc-9zvPHzgF-7v3fE7PYRjqWdrEY7cscw2J9wyrM_4LJ7RZ--gxBanrjk0sYQVnTTjIy4UNE02NY1rriv02TXvZHZXaWFvwq1d_Ypxg-Rz1AeY7guu1-M7JQgfNUaUIRIEpcbsM39EqRGPcCGhJLu-2gEaJ3BpuHTfJu7x0Swcq6Iwh6rSLAhap8G3Bxm8',
    resy_url: null,
    slots: [
      { configToken: 'demo-6', startTime: '18:45', endTime: '20:45', seatingType: 'Dining Room' },
      { configToken: 'demo-7', startTime: '19:15', endTime: '21:15', seatingType: 'Dining Room' },
      { configToken: 'demo-8', startTime: '19:30', endTime: '21:30', seatingType: 'Patio' },
      { configToken: 'demo-9', startTime: '20:00', endTime: '22:00', seatingType: 'Dining Room' },
      { configToken: 'demo-10', startTime: '21:15', endTime: '23:15', seatingType: 'Bar' },
    ],
  },
  {
    id: 3, resy_venue_id: 998, name: 'Ramen Tatsu-ya', cuisine: 'Japanese',
    price_range: 2, rating: 4.6, neighborhood: 'North Lamar',
    image_url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBeKWZ5ZEZwIJtn8nBoqG8Z_GFtf-AsH16Y_3ZeapCs2s0_gEqytnItWQLvR4b-Tuby78Gc_EIC6cgy4UmwGZwD8TSs4_zEt9Yjm0s8MWCquag3NMCocp4KNZHGNYOmXYYaGkMfguHXSfIAaSXnneRthDVcI9pmJJUNgIP59Ys_CZqoiVuITqsjARTxm7szUW0ATinn12Y_KXl5N6_GrpXXhFp5iVnPSlkljQDPNn7cCm898Ars1J7590NVnIQbmmbAw-aFXfOMGlw',
    resy_url: null,
    slots: [
      { configToken: 'demo-11', startTime: '18:45', endTime: '20:15', seatingType: 'Dining Room' },
      { configToken: 'demo-12', startTime: '19:15', endTime: '20:45', seatingType: 'Dining Room' },
      { configToken: 'demo-13', startTime: '19:30', endTime: '21:00', seatingType: 'Dining Room' },
      { configToken: 'demo-14', startTime: '20:00', endTime: '21:30', seatingType: 'Dining Room' },
      { configToken: 'demo-15', startTime: '21:15', endTime: '22:45', seatingType: 'Dining Room' },
    ],
  },
];

const DEMO_RESERVATIONS: Reservation[] = [{
  resyToken: 'demo-res-1', venueName: 'Uchi', venueId: 10804,
  date: (() => { const d = new Date(); d.setDate(d.getDate() + 5); return d.toISOString().split('T')[0]; })(),
  time: '19:15', partySize: 2, seatingType: 'Dining Room', status: 'confirmed',
}];

const DEMO_FAVORITES: Favorite[] = [
  { favorite_id: 1, id: 1, resy_venue_id: 10804, name: 'Uchi', cuisine: 'Japanese', price_range: 4, rating: 4.8, neighborhood: 'South Lamar', image_url: null },
  { favorite_id: 2, id: 2, resy_venue_id: 999, name: 'Emmer & Rye', cuisine: 'New American', price_range: 3, rating: 4.7, neighborhood: 'Rainey Street', image_url: null },
  { favorite_id: 3, id: 3, resy_venue_id: 998, name: 'Ramen Tatsu-ya', cuisine: 'Japanese', price_range: 2, rating: 4.6, neighborhood: 'North Lamar', image_url: null },
];

// ── Component ──────────────────────────────────────────────────────────────

export default function FoodPage() {
  // Filters
  const [dateOffset, setDateOffset] = useState(0);
  const [partySize, setPartySize] = useState(2);
  const [selectedTime, setSelectedTime] = useState('7:00 PM');
  const [cuisine, setCuisine] = useState('Any');
  const [priceRange, setPriceRange] = useState(0);

  // Filter dropdown state
  const [openFilter, setOpenFilter] = useState<string | null>(null);

  // Data
  const [restaurants, setRestaurants] = useState<(Restaurant & { slots: TimeSlot[] })[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  // Booking
  const [pendingBook, setPendingBook] = useState<{
    restaurant: Restaurant;
    slot: TimeSlot;
  } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookedTokens, setBookedTokens] = useState<Set<string>>(new Set());

  const date = dateFromOffset(dateOffset);
  const dateLabel = DATE_OPTIONS.find((d) => d.offset === dateOffset)?.label ?? date;

  // ── Data loading ─────────────────────────────────────────────────────

  const loadRestaurants = useCallback(async () => {
    if (DEMO_MODE) {
      setRestaurants(DEMO_RESTAURANTS);
      return;
    }

    setLoading(true);
    try {
      // Get cached restaurants, filtered by cuisine/price
      const params = new URLSearchParams();
      if (cuisine !== 'Any') params.set('cuisine', cuisine);
      if (priceRange > 0) params.set('price_range', String(priceRange));
      const cacheRes = await fetch(`/api/food/cache?${params}`);
      const cached: Restaurant[] = cacheRes.ok ? await cacheRes.json() : [];

      if (cached.length === 0) {
        setRestaurants([]);
        setLoading(false);
        return;
      }

      // Check availability for each restaurant in parallel (max 5 concurrent)
      const results: (Restaurant & { slots: TimeSlot[] })[] = cached.map((r) => ({ ...r, slots: [] }));
      setRestaurants(results); // Show restaurant names immediately

      const limit = 5;
      for (let i = 0; i < cached.length; i += limit) {
        const batch = cached.slice(i, i + limit);
        const availResults = await Promise.allSettled(
          batch.map(async (r) => {
            const res = await fetch(
              `/api/food/availability?venue_id=${r.resy_venue_id}&date=${date}&party_size=${partySize}`
            );
            if (!res.ok) return { venueId: r.resy_venue_id, slots: [] as TimeSlot[] };
            const data = await res.json();
            return { venueId: r.resy_venue_id, slots: data.slots ?? [] };
          })
        );

        // Update results as they come in
        setRestaurants((prev) => {
          const updated = [...prev];
          for (const result of availResults) {
            if (result.status !== 'fulfilled') continue;
            const { venueId, slots } = result.value;
            const idx = updated.findIndex((r) => r.resy_venue_id === venueId);
            if (idx >= 0) updated[idx] = { ...updated[idx], slots };
          }
          return updated;
        });
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [cuisine, priceRange, date, partySize]);

  const loadSidebar = useCallback(async () => {
    if (DEMO_MODE) {
      setReservations(DEMO_RESERVATIONS);
      setFavorites(DEMO_FAVORITES);
      return;
    }

    try {
      const [resRes, favRes] = await Promise.allSettled([
        fetch('/api/food/reservations'),
        fetch('/api/food/favorites'),
      ]);
      if (resRes.status === 'fulfilled' && resRes.value.ok) {
        setReservations(await resRes.value.json());
      }
      if (favRes.status === 'fulfilled' && favRes.value.ok) {
        setFavorites(await favRes.value.json());
      }
    } catch { /* silent */ }
  }, []);

  async function refreshCache() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/food/cache', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.cached > 0) {
        showToast(`Cached ${data.cached} restaurants from Resy`);
        loadRestaurants();
      } else {
        showToast('Failed to refresh restaurant cache');
      }
    } catch {
      showToast('Failed to refresh restaurant cache');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { loadRestaurants(); }, [loadRestaurants]);
  useEffect(() => { loadSidebar(); }, [loadSidebar]);

  // ── Filter time slots ────────────────────────────────────────────────

  const targetMinutes = timeToMinutes(filterTime(selectedTime));

  function filterSlots(slots: TimeSlot[]): TimeSlot[] {
    return slots.filter((s) => {
      const slotMin = timeToMinutes(s.startTime);
      return Math.abs(slotMin - targetMinutes) <= 60; // ±1 hour
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleFavorite(restaurant: Restaurant) {
    if (DEMO_MODE) return;
    const isFav = favorites.some((f) => f.resy_venue_id === restaurant.resy_venue_id);
    if (isFav) {
      await fetch('/api/food/favorites', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id }),
      });
      setFavorites((prev) => prev.filter((f) => f.resy_venue_id !== restaurant.resy_venue_id));
    } else {
      await fetch('/api/food/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurant.id }),
      });
      setFavorites((prev) => [...prev, {
        favorite_id: 0, id: restaurant.id, resy_venue_id: restaurant.resy_venue_id,
        name: restaurant.name, cuisine: restaurant.cuisine, price_range: restaurant.price_range,
        rating: restaurant.rating, neighborhood: restaurant.neighborhood, image_url: restaurant.image_url,
      }]);
    }
  }

  function handleSlotClick(restaurant: Restaurant, slot: TimeSlot) {
    if (bookedTokens.has(slot.configToken)) return;
    setPendingBook({ restaurant, slot });
  }

  async function confirmBooking() {
    if (!pendingBook) return;
    const { restaurant, slot } = pendingBook;
    setBooking(true);

    if (DEMO_MODE) {
      // Simulate booking without calling Resy
      await new Promise((r) => setTimeout(r, 800));
      showToast(`Booked! ${restaurant.name}, ${dateLabel} ${formatTime(slot.startTime)}, ${partySize} people.`);
      setBookedTokens((prev) => new Set(prev).add(slot.configToken));
      setReservations((prev) => [{
        resyToken: `demo-${Date.now()}`,
        venueName: restaurant.name,
        venueId: restaurant.resy_venue_id,
        date,
        time: slot.startTime,
        partySize,
        seatingType: slot.seatingType,
        status: 'confirmed',
      }, ...prev]);
      setBooking(false);
      setPendingBook(null);
      return;
    }

    try {
      const res = await fetch('/api/food/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: restaurant.resy_venue_id,
          venue_name: restaurant.name,
          config_token: slot.configToken,
          date,
          party_size: partySize,
          time: slot.startTime,
          seating_type: slot.seatingType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showToast(`Booked! ${restaurant.name}, ${dateLabel} ${formatTime(slot.startTime)}, ${partySize} people.`);
        setBookedTokens((prev) => new Set(prev).add(slot.configToken));
        setReservations((prev) => [{
          resyToken: data.resyToken,
          venueName: restaurant.name,
          venueId: restaurant.resy_venue_id,
          date,
          time: slot.startTime,
          partySize,
          seatingType: slot.seatingType,
          status: 'confirmed',
        }, ...prev]);
      } else {
        showToast(data.error ?? 'Booking failed — slot may have been taken');
      }
    } catch {
      showToast('Booking failed — check your connection');
    } finally {
      setBooking(false);
      setPendingBook(null);
    }
  }

  async function cancelReservation(resyToken: string, venueName: string) {
    if (DEMO_MODE) {
      showToast(`Reservation at ${venueName} cancelled.`);
      setReservations((prev) =>
        prev.map((r) => r.resyToken === resyToken ? { ...r, status: 'cancelled' } : r)
      );
      return;
    }
    try {
      const res = await fetch('/api/food/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resy_token: resyToken }),
      });
      if (res.ok) {
        showToast(`Reservation at ${venueName} cancelled.`);
        setReservations((prev) =>
          prev.map((r) => r.resyToken === resyToken ? { ...r, status: 'cancelled' } : r)
        );
      } else {
        showToast('Cancellation failed');
      }
    } catch {
      showToast('Cancellation failed');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  const favoriteIds = new Set(favorites.map((f) => f.resy_venue_id));

  // Sort: favorites first, then by rating
  const sortedRestaurants = [...restaurants].sort((a, b) => {
    const aFav = favoriteIds.has(a.resy_venue_id) ? 1 : 0;
    const bFav = favoriteIds.has(b.resy_venue_id) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav;
    return (b.rating ?? 0) - (a.rating ?? 0);
  });

  const upcomingReservations = reservations.filter(
    (r) => r.status === 'confirmed' && r.date >= new Date().toISOString().split('T')[0]
  );
  const pastReservations = reservations.filter(
    (r) => r.status !== 'confirmed' || r.date < new Date().toISOString().split('T')[0]
  );

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-on-primary px-4 py-2 text-xs font-bold">
          {toast}
        </div>
      )}

      {/* Booking confirmation */}
      {pendingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-container-high border border-outline-variant p-6 max-w-sm w-full mx-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface mb-4">Confirm Reservation</h3>
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-on-surface-variant">Restaurant</span>
                <span className="text-on-surface font-bold">{pendingBook.restaurant.name}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-on-surface-variant">Date</span>
                <span className="text-on-surface">{dateLabel}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-on-surface-variant">Time</span>
                <span className="text-on-surface">{formatTime(pendingBook.slot.startTime)}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-on-surface-variant">Party</span>
                <span className="text-on-surface">{partySize} {partySize === 1 ? 'person' : 'people'}</span>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-on-surface-variant">Seating</span>
                <span className="text-on-surface">{pendingBook.slot.seatingType}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingBook(null)}
                disabled={booking}
                className="flex-1 py-2 border border-outline-variant text-on-surface-variant text-xs font-bold uppercase hover:bg-surface-bright transition-colors duration-75"
              >
                Cancel
              </button>
              <button
                onClick={confirmBooking}
                disabled={booking}
                className="flex-1 py-2 bg-primary text-on-primary text-xs font-bold uppercase hover:brightness-110 disabled:opacity-50"
              >
                {booking ? 'Booking...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header + Filters */}
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-4">
          <BackButton />
          <h1 className="text-xl font-bold tracking-tight text-on-surface uppercase">Food</h1>
          {!DEMO_MODE && (
            <button
              onClick={refreshCache}
              disabled={refreshing}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant text-on-surface-variant text-[10px] font-bold uppercase tracking-wider hover:text-primary hover:border-primary transition-colors duration-75 disabled:opacity-30"
              title="Refresh restaurant cache from Resy"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Date filter */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === 'date' ? null : 'date')}
              className="flex items-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-on-surface hover:bg-surface-bright transition-colors duration-75"
            >
              <Calendar size={14} />
              {dateLabel}
            </button>
            {openFilter === 'date' && (
              <div className="absolute top-full left-0 mt-1 z-40 bg-surface-container-high border border-outline-variant min-w-[160px]">
                {DATE_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => { setDateOffset(opt.offset); setOpenFilter(null); }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-surface-bright ${dateOffset === opt.offset ? 'text-primary font-bold' : 'text-on-surface'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Party size */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === 'party' ? null : 'party')}
              className="flex items-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-on-surface hover:bg-surface-bright transition-colors duration-75"
            >
              <Users size={14} />
              {partySize} {partySize === 1 ? 'person' : 'people'}
            </button>
            {openFilter === 'party' && (
              <div className="absolute top-full left-0 mt-1 z-40 bg-surface-container-high border border-outline-variant">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => { setPartySize(n); setOpenFilter(null); }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-surface-bright ${partySize === n ? 'text-primary font-bold' : 'text-on-surface'}`}
                  >
                    {n} {n === 1 ? 'person' : 'people'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === 'time' ? null : 'time')}
              className="flex items-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-on-surface hover:bg-surface-bright transition-colors duration-75"
            >
              <Clock size={14} />
              {selectedTime}
            </button>
            {openFilter === 'time' && (
              <div className="absolute top-full left-0 mt-1 z-40 bg-surface-container-high border border-outline-variant max-h-60 overflow-y-auto">
                {TIME_OPTIONS.map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTime(t); setOpenFilter(null); }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-surface-bright ${selectedTime === t ? 'text-primary font-bold' : 'text-on-surface'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cuisine */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === 'cuisine' ? null : 'cuisine')}
              className="flex items-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-on-surface hover:bg-surface-bright transition-colors duration-75"
            >
              <UtensilsCrossed size={14} />
              {cuisine === 'Any' ? 'Any cuisine' : cuisine}
              {cuisine !== 'Any' && (
                <X size={12} className="text-on-surface-variant" onClick={(e) => { e.stopPropagation(); setCuisine('Any'); }} />
              )}
            </button>
            {openFilter === 'cuisine' && (
              <div className="absolute top-full left-0 mt-1 z-40 bg-surface-container-high border border-outline-variant max-h-60 overflow-y-auto min-w-[160px]">
                {CUISINES.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setCuisine(c); setOpenFilter(null); }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-surface-bright ${cuisine === c ? 'text-primary font-bold' : 'text-on-surface'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Price */}
          <div className="relative">
            <button
              onClick={() => setOpenFilter(openFilter === 'price' ? null : 'price')}
              className="flex items-center gap-2 border border-outline-variant bg-surface-container-low px-4 py-2 text-[11px] font-bold tracking-wider uppercase text-on-surface hover:bg-surface-bright transition-colors duration-75"
            >
              <DollarSign size={14} />
              {priceRange === 0 ? 'Any price' : '$'.repeat(priceRange)}
              {priceRange > 0 && (
                <X size={12} className="text-on-surface-variant" onClick={(e) => { e.stopPropagation(); setPriceRange(0); }} />
              )}
            </button>
            {openFilter === 'price' && (
              <div className="absolute top-full left-0 mt-1 z-40 bg-surface-container-high border border-outline-variant">
                {PRICE_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => { setPriceRange(p.value); setOpenFilter(null); }}
                    className={`block w-full text-left px-4 py-2 text-xs hover:bg-surface-bright ${priceRange === p.value ? 'text-primary font-bold' : 'text-on-surface'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close dropdowns on outside click */}
      {openFilter && (
        <div className="fixed inset-0 z-30" onClick={() => setOpenFilter(null)} />
      )}

      {/* Two-column layout */}
      <div className="flex gap-0 -mx-6 -mb-6" style={{ height: 'calc(100vh - 180px)' }}>
        {/* Left: Restaurant results */}
        <div className="w-2/3 border-r border-outline-variant overflow-y-auto bg-surface-container-lowest p-6 space-y-4">
          {loading && restaurants.length === 0 && (
            <div className="text-center text-on-surface-variant text-sm py-12">Loading restaurants...</div>
          )}

          {!loading && restaurants.length === 0 && (
            <div className="text-center py-12">
              <p className="text-on-surface-variant text-sm mb-4">
                {refreshing ? 'Fetching restaurants from Resy...' : 'No restaurants cached.'}
              </p>
              {!refreshing && (
                <button
                  onClick={refreshCache}
                  className="px-4 py-2 bg-primary text-on-primary text-xs font-bold hover:brightness-110"
                >
                  Load Restaurants
                </button>
              )}
            </div>
          )}

          {sortedRestaurants.map((r) => {
            const isFav = favoriteIds.has(r.resy_venue_id);
            const filteredSlots = filterSlots(r.slots);

            return (
              <div
                key={r.resy_venue_id}
                className="border border-outline-variant bg-surface-container p-4 flex gap-6 relative group"
              >
                {/* Hover accent */}
                <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-primary transition-colors duration-75" />

                {/* Image */}
                {r.image_url ? (
                  <img
                    src={r.image_url}
                    alt={r.name}
                    className="w-32 h-32 object-cover border border-outline-variant shrink-0"
                  />
                ) : (
                  <div className="w-32 h-32 bg-surface-container-highest border border-outline-variant shrink-0 flex items-center justify-center">
                    <UtensilsCrossed size={24} className="text-on-surface-variant/30" />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 flex flex-col justify-between min-w-0">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-on-surface uppercase tracking-tight">{r.name}</h2>
                        <button
                          onClick={() => toggleFavorite(r)}
                          className="shrink-0"
                        >
                          <Heart
                            size={16}
                            className={isFav ? 'text-primary fill-primary' : 'text-on-surface-variant/40 hover:text-primary'}
                          />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 bg-surface-container-highest px-2 py-1 border border-outline-variant shrink-0">
                        <Star size={14} className="text-tertiary-container" fill="currentColor" />
                        <span className="font-mono text-sm text-on-surface">{r.rating?.toFixed(1) ?? '—'}</span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-4">
                      <span>{r.cuisine || 'Restaurant'}</span>
                      <span className="text-on-surface">{'$'.repeat(r.price_range || 1)}</span>
                      {r.neighborhood && <span>{r.neighborhood}</span>}
                    </div>
                  </div>

                  {/* Time slots */}
                  <div className="flex flex-wrap gap-2">
                    {filteredSlots.length > 0 ? (
                      filteredSlots.map((slot) => {
                        const isBooked = bookedTokens.has(slot.configToken);
                        return isBooked ? (
                          <span key={slot.configToken} className="border border-primary bg-primary/20 text-primary px-3 py-1 font-mono text-xs">
                            {formatTime(slot.startTime)} ✓
                          </span>
                        ) : (
                          <button
                            key={slot.configToken}
                            onClick={() => handleSlotClick(r, slot)}
                            className="border border-primary/40 bg-primary/10 text-primary px-3 py-1 font-mono text-xs hover:bg-primary hover:text-on-primary transition-colors duration-75"
                          >
                            {formatTime(slot.startTime)}
                          </button>
                        );
                      })
                    ) : r.slots.length > 0 ? (
                      r.slots.slice(0, 5).map((slot) => {
                        const isBooked = bookedTokens.has(slot.configToken);
                        return isBooked ? (
                          <span key={slot.configToken} className="border border-primary bg-primary/20 text-primary px-3 py-1 font-mono text-xs">
                            {formatTime(slot.startTime)} ✓
                          </span>
                        ) : (
                          <button
                            key={slot.configToken}
                            onClick={() => handleSlotClick(r, slot)}
                            className="border border-outline-variant bg-transparent text-on-surface-variant px-3 py-1 font-mono text-xs hover:bg-surface-bright transition-colors duration-75"
                          >
                            {formatTime(slot.startTime)}
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-xs text-on-surface-variant/50">No availability</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Sidebar */}
        <div className="w-1/3 bg-surface overflow-y-auto p-6 space-y-8">
          {/* Upcoming */}
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-outline-variant pb-2">
              <Calendar size={16} className="text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Upcoming</h3>
            </div>

            {upcomingReservations.length > 0 ? (
              <div className="space-y-3">
                {upcomingReservations.map((r) => (
                  <div key={r.resyToken} className="border border-primary bg-primary/5 p-4 relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-on-surface uppercase">{r.venueName}</h4>
                      <span className="bg-surface-container-highest px-2 py-1 text-[10px] font-mono text-primary uppercase border border-outline-variant">
                        Confirmed
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-mono text-on-surface-variant">
                        <span>Date</span>
                        <span className="text-on-surface">{new Date(r.date + 'T00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono text-on-surface-variant">
                        <span>Time</span>
                        <span className="text-on-surface">{formatTime(r.time)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-mono text-on-surface-variant">
                        <span>Party</span>
                        <span className="text-on-surface">{r.partySize} {r.partySize === 1 ? 'person' : 'people'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Cancel reservation at ${r.venueName}?`)) {
                          cancelReservation(r.resyToken, r.venueName);
                        }
                      }}
                      className="mt-3 text-[10px] font-mono text-error/60 hover:text-error transition-colors duration-75"
                    >
                      Cancel reservation
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-on-surface-variant">No upcoming reservations</p>
            )}
          </div>

          {/* Favorites */}
          <div>
            <div className="flex items-center gap-2 mb-4 border-b border-outline-variant pb-2">
              <Heart size={16} className="text-tertiary-container" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface">Favorites</h3>
            </div>
            {favorites.length > 0 ? (
              <ul className="space-y-2">
                {favorites.map((f) => (
                  <li
                    key={f.favorite_id}
                    className="flex items-center justify-between p-3 border border-outline-variant bg-surface-container hover:bg-surface-bright transition-colors duration-75 cursor-pointer"
                  >
                    <span className="font-bold text-sm uppercase">{f.name}</span>
                    <span className="text-on-surface-variant text-xs">&rarr;</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-on-surface-variant">No favorites yet</p>
            )}
          </div>

          {/* Past */}
          <div>
            <button
              onClick={() => setShowPast(!showPast)}
              className="w-full flex items-center justify-between border-b border-outline-variant pb-2 hover:text-primary transition-colors duration-75"
            >
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-on-surface-variant" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">Past</h3>
              </div>
              <ChevronDown size={16} className={`text-on-surface-variant transition-transform duration-75 ${showPast ? 'rotate-180' : ''}`} />
            </button>
            {showPast && pastReservations.length > 0 && (
              <ul className="mt-3 space-y-2">
                {pastReservations.map((r, i) => (
                  <li key={i} className="flex items-center justify-between p-3 border border-outline-variant bg-surface-container text-on-surface-variant text-xs">
                    <span>{r.venueName}</span>
                    <span className="font-mono">{r.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
