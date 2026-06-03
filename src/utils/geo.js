/**
 * geo.js — distance & travel-time estimation (the FREE engine).
 *
 * PURE functions, no API calls. Straight-line haversine + a conservative
 * road-detour / speed model gives a "good enough" travel time between two
 * located stops. This is what makes the schedule distance-aware:
 *   - scheduleDay() leaves travel gaps between consecutive stops
 *   - validateTrip() flags two stops that are too far apart for their timing
 *
 * Phase 2 can swap `travelLeg` for a real routing call (OSRM / Google Routes)
 * without touching its callers — same shape in, same shape out.
 */

// Tunables — deliberately conservative so we warn rather than under-estimate.
const DETOUR    = 1.3;   // straight-line → road distance multiplier
const WALK_KMH  = 4.8;   // comfortable walking pace
const DRIVE_KMH = 26;    // urban door-to-door incl. traffic + parking
const WALK_MAX_KM = 1.0; // beyond this we assume a drive/ride

/** Great-circle distance in km between {lat,lng} points. null if coords missing. */
export function haversineKm(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Travel estimate between two located stops.
 * Returns { km, min, mode } where km is the straight-line distance (for display),
 * min is the estimated door-to-door minutes, mode is 'walk' | 'drive'. null when
 * either stop has no coordinates (we can't know — callers fall back to a buffer).
 */
export function travelLeg(a, b) {
  const km = haversineKm(a, b);
  if (km == null) return null;
  const road = km * DETOUR;
  if (road <= WALK_MAX_KM) {
    return { km, min: Math.max(2, Math.round((road / WALK_KMH) * 60)), mode: 'walk' };
  }
  return { km, min: Math.max(5, Math.round((road / DRIVE_KMH) * 60)), mode: 'drive' };
}

/** "850 m" / "3.2 km" — compact distance label. */
export function formatKm(km) {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}
