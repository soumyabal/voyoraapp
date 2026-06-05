/**
 * places.js — tiny Google Places helper for *backfilling* a place's photo.
 *
 * Activities added before we started storing photos (or via the AI planner) have
 * no `photo`. This does ONE cached Text-Search (New) call, biased to the place's
 * coordinates, and returns its first photo URL — so the itinerary cards can show a
 * thumbnail. Best-effort: returns null on any miss, never throws.
 */
import { GOOGLE_PLACES_API_KEY } from '../config';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.displayName,places.location,places.photos';
const photoUrl = name => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&maxHeightPx=420&key=${GOOGLE_PLACES_API_KEY}`;

const cache = new Map();   // "name@lat,lng" -> photo URL | null (avoids re-billing)

/**
 * Geocode a free-text address → { lat, lng, formattedAddress }. For lodging/stops
 * that AREN'T in Google Places as businesses (Airbnb/VRBO, a friend's house): the
 * address still resolves to coordinates, which is all the scheduling engine needs
 * (anchors the day, draws travel legs). Uses Places Text Search. null on miss.
 */
export async function geocodeAddress(address) {
  const q = (address || '').trim();
  if (!GOOGLE_PLACES_API_KEY || !q) return null;
  const key = `geo:${q}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.location,places.formattedAddress,places.displayName',
      },
      body: JSON.stringify({ textQuery: q, pageSize: 1 }),
    });
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json();
    const p = (data.places || [])[0];
    const loc = p?.location;
    const out = loc ? { lat: loc.latitude, lng: loc.longitude, formattedAddress: p.formattedAddress || q } : null;
    cache.set(key, out);
    return out;
  } catch { cache.set(key, null); return null; }
}

/** Reverse-geocode lat/lng → a human address (for a map-dropped pin). Uses the
 * classic Geocoding API; returns null if it's not enabled on the key (graceful). */
export async function reverseGeocode(lat, lng) {
  if (!GOOGLE_PLACES_API_KEY || lat == null || lng == null) return null;
  const key = `rev:${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    // Bound the request so the "Locating…" state can't hang forever if the key
    // lacks the Geocoding API or the network stalls.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_PLACES_API_KEY}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json();
    const addr = (data.results && data.results[0]?.formatted_address) || null;
    cache.set(key, addr);   // null also cached → we won't retry a key that can't geocode
    return addr;
  } catch { return null; }   // don't cache aborts/network errors — a later try may succeed
}

/** Best-effort photo URL for a place by name, biased to its coords. null on miss. */
export async function fetchPlacePhoto(name, lat, lng) {
  if (!GOOGLE_PLACES_API_KEY || !name) return null;
  const key = `${name}@${(lat ?? 0).toFixed(3)},${(lng ?? 0).toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const res = await fetch(PLACES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: name, pageSize: 1,
        ...(lat != null && lng != null
          ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 2000 } } }
          : {}),
      }),
    });
    if (!res.ok) { cache.set(key, null); return null; }
    const data = await res.json();
    const p = (data.places || [])[0];
    const photo = p?.photos?.[0]?.name ? photoUrl(p.photos[0].name) : null;
    cache.set(key, photo);
    return photo;
  } catch {
    cache.set(key, null);
    return null;
  }
}
