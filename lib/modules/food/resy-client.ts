// Resy API client abstraction.
// Implements direct calls to api.resy.com. Built with a clean interface
// so swapping to Apify MCP is a one-file change.

import fs from 'fs';
import path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ResyRestaurant {
  venueId: number;
  name: string;
  cuisine: string;
  priceRange: number;      // 1-4
  rating: number;
  neighborhood: string;
  address: string;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  description: string | null;
  resyUrl: string | null;
}

export interface ResyTimeSlot {
  configToken: string;
  startTime: string;       // "19:15"
  endTime: string;         // "21:15"
  seatingType: string;     // "Dining Room", "Bar", "Patio"
}

export interface ResyBookingDetails {
  bookToken: string;
  cancellationPolicy: string | null;
  paymentMethodId: number | null;
}

export interface ResyReservation {
  resyToken: string;
  venueName: string;
  venueId: number;
  date: string;
  time: string;
  partySize: number;
  seatingType: string;
  status: string;          // "confirmed", "cancelled"
}

// ── Credentials ────────────────────────────────────────────────────────────

function getResyCredentials(): { apiKey: string; authToken: string } {
  // Check .env.local first, then mpp-reseller/.env
  const apiKey = process.env.RESY_API_KEY ?? '';
  const authToken = process.env.RESY_AUTH_TOKEN ?? '';

  if (apiKey && authToken) return { apiKey, authToken };

  // Fall back to mpp-reseller/.env
  try {
    const envPath = path.join(process.cwd(), 'mpp-reseller', '.env');
    const content = fs.readFileSync(envPath, 'utf8');
    const keyMatch = content.match(/RESY_API_KEY=(.+)/);
    const tokenMatch = content.match(/RESY_AUTH_TOKEN=(.+)/);
    return {
      apiKey: keyMatch?.[1]?.trim() ?? '',
      authToken: tokenMatch?.[1]?.trim() ?? '',
    };
  } catch {
    return { apiKey: '', authToken: '' };
  }
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3.1 Safari/605.1.15';

function resyHeaders(): Record<string, string> {
  const { apiKey, authToken } = getResyCredentials();
  return {
    'Authorization': `ResyAPI api_key="${apiKey}"`,
    'X-Resy-Auth-Token': authToken,
    'X-Resy-Universal-Auth': authToken,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Origin': 'https://resy.com',
    'Referer': 'https://resy.com/',
    'User-Agent': BROWSER_UA,
  };
}

// ── API calls ──────────────────────────────────────────────────────────────

const RESY_BASE = 'https://api.resy.com';

export async function searchRestaurants(params: {
  lat?: number;
  lng?: number;
  radius?: number;
  query?: string;
  perPage?: number;
  page?: number;
}): Promise<ResyRestaurant[]> {
  const { lat = 30.2672, lng = -97.7431, radius = 32186 } = params; // 20 miles in meters
  const perPage = params.perPage ?? 50;
  const page = params.page ?? 1;

  const today = new Date().toISOString().split('T')[0];

  const res = await fetch(`${RESY_BASE}/3/venuesearch/search`, {
    method: 'POST',
    headers: resyHeaders(),
    body: JSON.stringify({
      geo: { latitude: lat, longitude: lng, radius },
      query: params.query ?? '',
      per_page: perPage,
      page,
      slot_filter: { day: today, party_size: 2 },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resy search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const hits = data?.search?.hits ?? [];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  return hits.map((h: any): ResyRestaurant => {
    const cuisineArr = Array.isArray(h.cuisine) ? h.cuisine : [];
    const ratingObj = h.rating ?? {};
    const images = Array.isArray(h.images) ? h.images : [];
    const locationSlug = h.location?.url_slug ?? 'austin-tx';
    return {
      venueId: Number(h.id?.resy ?? 0),
      name: String(h.name ?? ''),
      cuisine: cuisineArr.join(', '),
      priceRange: Number(h.price_range_id ?? 0),
      rating: Number(ratingObj.average ?? ratingObj ?? 0),
      neighborhood: String(h.neighborhood ?? ''),
      address: '',  // Not in search results; populated from venue detail if needed
      latitude: Number(h._geoloc?.lat ?? 0),
      longitude: Number(h._geoloc?.lng ?? 0),
      imageUrl: typeof images[0] === 'string' ? images[0] : null,
      description: String(h.content?.[0]?.body ?? ''),
      resyUrl: h.url_slug ? `https://resy.com/cities/${locationSlug}/venues/${h.url_slug}` : null,
    };
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function getAvailability(params: {
  venueId: number;
  date: string;            // YYYY-MM-DD
  partySize: number;
}): Promise<ResyTimeSlot[]> {
  const res = await fetch(`${RESY_BASE}/4/find`, {
    method: 'POST',
    headers: resyHeaders(),
    body: JSON.stringify({
      lat: 0,
      long: 0,
      day: params.date,
      party_size: params.partySize,
      venue_id: params.venueId,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return []; // No availability or error — treat as empty

  const data = await res.json();
  const venues = data?.results?.venues ?? [];

  const slots: ResyTimeSlot[] = [];
  for (const venue of venues) {
    const openSlots = venue?.slots ?? [];
    for (const slot of openSlots) {
      const config = slot?.config ?? {};
      const date = slot?.date ?? {};
      slots.push({
        configToken: String(config.token ?? ''),
        startTime: String(date.start?.split(' ')[1]?.slice(0, 5) ?? ''),
        endTime: String(date.end?.split(' ')[1]?.slice(0, 5) ?? ''),
        seatingType: String(config.type ?? 'Dining Room'),
      });
    }
  }

  return slots;
}

export async function getBookingDetails(params: {
  configToken: string;
  date: string;
  partySize: number;
}): Promise<ResyBookingDetails> {
  const res = await fetch(`${RESY_BASE}/3/details`, {
    method: 'POST',
    headers: resyHeaders(),
    body: JSON.stringify({
      config_id: params.configToken,
      day: params.date,
      party_size: params.partySize,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Resy details failed (${res.status})`);
  }

  const data = await res.json();
  return {
    bookToken: String(data?.book_token?.value ?? ''),
    cancellationPolicy: data?.cancellation?.display?.policy ?? null,
    paymentMethodId: data?.user?.payment_methods?.[0]?.id ?? null,
  };
}

export async function bookReservation(params: {
  bookToken: string;
  paymentMethodId: number;
}): Promise<{ resyToken: string }> {
  const res = await fetch(`${RESY_BASE}/3/book`, {
    method: 'POST',
    headers: resyHeaders(),
    body: JSON.stringify({
      book_token: params.bookToken,
      struct_payment_method: { id: params.paymentMethodId },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resy booking failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return { resyToken: String(data?.resy_token ?? data?.reservation_id ?? '') };
}

export async function getMyReservations(): Promise<ResyReservation[]> {
  const res = await fetch(`${RESY_BASE}/3/user/reservations`, {
    headers: resyHeaders(),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];

  const data = await res.json();
  const reservations: ResyReservation[] = [];

  for (const r of data?.reservations ?? []) {
    const venue = r?.venue ?? {};
    const reservation = r?.reservation ?? {};
    reservations.push({
      resyToken: String(r?.resy_token ?? reservation?.resy_token ?? ''),
      venueName: String(venue?.name ?? ''),
      venueId: Number(venue?.id ?? 0),
      date: String(reservation?.day ?? ''),
      time: String(reservation?.time_slot ?? ''),
      partySize: Number(reservation?.party_size ?? reservation?.num_seats ?? 0),
      seatingType: String(reservation?.type ?? ''),
      status: String(reservation?.status ?? 'confirmed'),
    });
  }

  return reservations;
}

export async function cancelReservation(params: {
  resyToken: string;
}): Promise<void> {
  const res = await fetch(`${RESY_BASE}/3/cancel`, {
    method: 'POST',
    headers: resyHeaders(),
    body: JSON.stringify({ resy_token: params.resyToken }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resy cancel failed (${res.status}): ${text.slice(0, 200)}`);
  }
}
