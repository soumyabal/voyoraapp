/**
 * mapsRoute.js — turn a day's plan into a Google Maps route.
 *
 * Builds the ordered geo-waypoints for a day — where you WAKE (last night's hotel
 * / Day-1 origin) → the day's located stops in time order → where you SLEEP
 * tonight — and a Google Maps "directions" URL that opens the native app with the
 * full route (free, no API key). The in-app polyline (Directions API) is a Phase-2
 * upgrade; the waypoint builder here is the shared input for both.
 */
import { dayStartAnchor, dayEndAnchor } from './tripValidator';

/**
 * Ordered { lat, lng, label } points to route a day:
 *   [ start, ...located stops (time-sorted, non-skipped), end ]
 * Drops points without coords; dedupes consecutive identical coords (e.g. when the
 * day starts at the hotel that's also its first stop).
 */
export function dayRoutePoints(trip, dayIndex) {
  const day = trip?.days?.[dayIndex];
  if (!day) return [];

  const start = dayStartAnchor(trip, dayIndex);
  const end = dayEndAnchor(trip, dayIndex);
  // Routable stops = located PLACES (food/activity). The hotel is the start/end
  // anchor, not a mid-stop; transport is the travel itself; notes aren't places.
  const stops = [...(day.activities || [])]
    .filter(
      (a) =>
        a.status !== 'skipped' &&
        a.time &&                 // skip UNSCHEDULED stops (didn't fit their hours)
        a.lat != null &&
        a.lng != null &&
        a.type !== 'stay' &&
        a.type !== 'transport' &&
        a.type !== 'note',
    )
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .map((a) => ({ lat: a.lat, lng: a.lng, label: a.name }));

  const pts = [];
  if (start) pts.push({ lat: start.lat, lng: start.lng, label: start.label });
  pts.push(...stops);
  if (end) pts.push({ lat: end.lat, lng: end.lng, label: end.label });

  return pts.filter(
    (p, i) => i === 0 || p.lat !== pts[i - 1].lat || p.lng !== pts[i - 1].lng,
  );
}

/**
 * Google Maps directions URL for a day's route (universal cross-platform form —
 * opens the Maps app, no key/cost). null when there aren't ≥2 distinct points.
 */
export function googleMapsDayUrl(trip, dayIndex) {
  const pts = dayRoutePoints(trip, dayIndex);
  if (pts.length < 2) return null;
  const ll = (p) => `${p.lat},${p.lng}`;
  const origin = encodeURIComponent(ll(pts[0]));
  const destination = encodeURIComponent(ll(pts[pts.length - 1]));
  const mid = pts
    .slice(1, -1)
    .map(ll)
    .join('|');
  let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${origin}&destination=${destination}`;
  if (mid) url += `&waypoints=${encodeURIComponent(mid)}`;
  return url;
}

/**
 * PATH-STYLE day-route URL — for SHARED TEXT and PDF (not in-app Linking).
 * `https://www.google.com/maps/dir/lat,lng/lat,lng/...` has no query string, so
 * chat link-detectors (SMS / email / some chat apps) can't truncate it at a `|`
 * or `&` the way they do the `?api=1&waypoints=…` form — it stays one tappable
 * link. Coords trimmed to 5 dp (~1 m, shorter). null when < 2 distinct points.
 */
export function googleMapsDayShareUrl(trip, dayIndex) {
  const pts = dayRoutePoints(trip, dayIndex);
  if (pts.length < 2) return null;
  const seg = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  return `https://www.google.com/maps/dir/${pts.map(seg).join('/')}`;
}

/** A single-place Google Maps link (for PDF address hyperlinks). null w/o coords. */
export function googleMapsPlaceUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lng.toFixed(5)}`;
}
