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
  } catch (e) {
    cache.set(key, null);
    return null;
  }
}
