/**
 * gazetteer.js — a small OFFLINE place→coordinates table (no API), the curated core of the
 * smart-paste "knowledge graph". Lets imported flights (by IATA code) and major-city stops get
 * real coordinates with zero API calls — which in turn lights up the timezone features (zone
 * flags, cross-zone leg labels) on pasted trips. Specific POIs (a museum, a park) still need
 * Google Places resolution (stage D); this covers the high-leverage airports + cities.
 *
 * Each entry carries `tz` purely so the test can assert the coordinates resolve to the expected
 * IANA zone (a deterministic guard against coordinate typos).
 */

// IATA airport code → { lat, lng, name, tz }
export const AIRPORTS = {
  ORD: { lat: 41.9742, lng: -87.9073, name: "Chicago O'Hare", tz: 'America/Chicago' },
  MDW: { lat: 41.7868, lng: -87.7522, name: 'Chicago Midway', tz: 'America/Chicago' },
  LAX: { lat: 33.9416, lng: -118.4085, name: 'Los Angeles Intl', tz: 'America/Los_Angeles' },
  SFO: { lat: 37.6213, lng: -122.3790, name: 'San Francisco Intl', tz: 'America/Los_Angeles' },
  SAN: { lat: 32.7338, lng: -117.1933, name: 'San Diego Intl', tz: 'America/Los_Angeles' },
  SEA: { lat: 47.4502, lng: -122.3088, name: 'Seattle-Tacoma', tz: 'America/Los_Angeles' },
  LAS: { lat: 36.0840, lng: -115.1537, name: 'Las Vegas Harry Reid', tz: 'America/Los_Angeles' },
  PHX: { lat: 33.4342, lng: -112.0080, name: 'Phoenix Sky Harbor', tz: 'America/Phoenix' },
  DEN: { lat: 39.8561, lng: -104.6737, name: 'Denver Intl', tz: 'America/Denver' },
  DFW: { lat: 32.8998, lng: -97.0403, name: 'Dallas/Fort Worth', tz: 'America/Chicago' },
  JFK: { lat: 40.6413, lng: -73.7781, name: 'New York JFK', tz: 'America/New_York' },
  EWR: { lat: 40.6895, lng: -74.1745, name: 'Newark', tz: 'America/New_York' },
  BOS: { lat: 42.3656, lng: -71.0096, name: 'Boston Logan', tz: 'America/New_York' },
  ATL: { lat: 33.6407, lng: -84.4277, name: 'Atlanta', tz: 'America/New_York' },
  MIA: { lat: 25.7959, lng: -80.2870, name: 'Miami Intl', tz: 'America/New_York' },
  YYZ: { lat: 43.6777, lng: -79.6248, name: 'Toronto Pearson', tz: 'America/Toronto' },
  MEX: { lat: 19.4361, lng: -99.0719, name: 'Mexico City', tz: 'America/Mexico_City' },
  LHR: { lat: 51.4700, lng: -0.4543, name: 'London Heathrow', tz: 'Europe/London' },
  CDG: { lat: 49.0097, lng: 2.5479, name: 'Paris Charles de Gaulle', tz: 'Europe/Paris' },
  AMS: { lat: 52.3105, lng: 4.7683, name: 'Amsterdam Schiphol', tz: 'Europe/Amsterdam' },
  FRA: { lat: 50.0379, lng: 8.5622, name: 'Frankfurt', tz: 'Europe/Berlin' },
  NRT: { lat: 35.7720, lng: 140.3929, name: 'Tokyo Narita', tz: 'Asia/Tokyo' },
  HND: { lat: 35.5494, lng: 139.7798, name: 'Tokyo Haneda', tz: 'Asia/Tokyo' },
  HKG: { lat: 22.3080, lng: 113.9185, name: 'Hong Kong Intl', tz: 'Asia/Hong_Kong' },
  SIN: { lat: 1.3644, lng: 103.9915, name: 'Singapore Changi', tz: 'Asia/Singapore' },
  DXB: { lat: 25.2532, lng: 55.3657, name: 'Dubai Intl', tz: 'Asia/Dubai' },
  DEL: { lat: 28.5562, lng: 77.1000, name: 'Delhi Indira Gandhi', tz: 'Asia/Kolkata' },
  BOM: { lat: 19.0896, lng: 72.8656, name: 'Mumbai', tz: 'Asia/Kolkata' },
  SYD: { lat: -33.9399, lng: 151.1753, name: 'Sydney', tz: 'Australia/Sydney' },
  GRU: { lat: -23.4356, lng: -46.4731, name: 'São Paulo Guarulhos', tz: 'America/Sao_Paulo' },
};

// City name → { lat, lng, tz } (downtown-ish). Lowercased keys for matching.
export const CITIES = {
  'los angeles': { lat: 34.0522, lng: -118.2437, tz: 'America/Los_Angeles' },
  'san diego': { lat: 32.7157, lng: -117.1611, tz: 'America/Los_Angeles' },
  'san francisco': { lat: 37.7749, lng: -122.4194, tz: 'America/Los_Angeles' },
  'las vegas': { lat: 36.1699, lng: -115.1398, tz: 'America/Los_Angeles' },
  'seattle': { lat: 47.6062, lng: -122.3321, tz: 'America/Los_Angeles' },
  'portland': { lat: 45.5152, lng: -122.6784, tz: 'America/Los_Angeles' },
  'denver': { lat: 39.7392, lng: -104.9903, tz: 'America/Denver' },
  'chicago': { lat: 41.8781, lng: -87.6298, tz: 'America/Chicago' },
  'new york': { lat: 40.7128, lng: -74.0060, tz: 'America/New_York' },
  'boston': { lat: 42.3601, lng: -71.0589, tz: 'America/New_York' },
  'miami': { lat: 25.7617, lng: -80.1918, tz: 'America/New_York' },
  'washington': { lat: 38.9072, lng: -77.0369, tz: 'America/New_York' },
  'toronto': { lat: 43.6532, lng: -79.3832, tz: 'America/Toronto' },
  'london': { lat: 51.5074, lng: -0.1278, tz: 'Europe/London' },
  'paris': { lat: 48.8566, lng: 2.3522, tz: 'Europe/Paris' },
  'amsterdam': { lat: 52.3676, lng: 4.9041, tz: 'Europe/Amsterdam' },
  'rome': { lat: 41.9028, lng: 12.4964, tz: 'Europe/Rome' },
  'barcelona': { lat: 41.3851, lng: 2.1734, tz: 'Europe/Madrid' },
  'tokyo': { lat: 35.6762, lng: 139.6503, tz: 'Asia/Tokyo' },
  'singapore': { lat: 1.3521, lng: 103.8198, tz: 'Asia/Singapore' },
  'dubai': { lat: 25.2048, lng: 55.2708, tz: 'Asia/Dubai' },
  'sydney': { lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney' },
};

/**
 * Best offline coordinates for a piece of text: an IATA airport code (last one wins — the
 * destination in "Flight ORD → LAX"), else a known city name (longest match). Returns
 * { lat, lng } | null. No API.
 */
export function lookupPlace(text) {
  if (!text) return null;
  const codes = String(text).match(/\b[A-Z]{3}\b/g) || [];
  for (let i = codes.length - 1; i >= 0; i--) {
    const a = AIRPORTS[codes[i]];
    if (a) return { lat: a.lat, lng: a.lng };
  }
  const lower = String(text).toLowerCase();
  const keys = Object.keys(CITIES).sort((a, b) => b.length - a.length);
  for (const c of keys) {
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
      return { lat: CITIES[c].lat, lng: CITIES[c].lng };
    }
  }
  return null;
}
