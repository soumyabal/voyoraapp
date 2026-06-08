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
  // More international + US gateways (match the expanded city table below)
  BCN: { lat: 41.2974, lng: 2.0833, name: 'Barcelona El Prat', tz: 'Europe/Madrid' },
  FCO: { lat: 41.8003, lng: 12.2389, name: 'Rome Fiumicino', tz: 'Europe/Rome' },
  MUC: { lat: 48.3538, lng: 11.7861, name: 'Munich', tz: 'Europe/Berlin' },
  VIE: { lat: 48.1103, lng: 16.5697, name: 'Vienna', tz: 'Europe/Vienna' },
  ATH: { lat: 37.9364, lng: 23.9445, name: 'Athens', tz: 'Europe/Athens' },
  LIS: { lat: 38.7742, lng: -9.1342, name: 'Lisbon', tz: 'Europe/Lisbon' },
  DUB: { lat: 53.4264, lng: -6.2499, name: 'Dublin', tz: 'Europe/Dublin' },
  KEF: { lat: 63.9850, lng: -22.6056, name: 'Reykjavik Keflavik', tz: 'Atlantic/Reykjavik' },
  IST: { lat: 41.2753, lng: 28.7519, name: 'Istanbul', tz: 'Europe/Istanbul' },
  KIX: { lat: 34.4273, lng: 135.2440, name: 'Osaka Kansai', tz: 'Asia/Tokyo' },
  ICN: { lat: 37.4602, lng: 126.4407, name: 'Seoul Incheon', tz: 'Asia/Seoul' },
  PVG: { lat: 31.1443, lng: 121.8083, name: 'Shanghai Pudong', tz: 'Asia/Shanghai' },
  PEK: { lat: 40.0799, lng: 116.6031, name: 'Beijing Capital', tz: 'Asia/Shanghai' },
  DPS: { lat: -8.7482, lng: 115.1675, name: 'Bali Denpasar', tz: 'Asia/Makassar' },
  KUL: { lat: 2.7456, lng: 101.7099, name: 'Kuala Lumpur', tz: 'Asia/Kuala_Lumpur' },
  HNL: { lat: 21.3187, lng: -157.9224, name: 'Honolulu', tz: 'Pacific/Honolulu' },
  OGG: { lat: 20.8986, lng: -156.4305, name: 'Maui Kahului', tz: 'Pacific/Honolulu' },
  MCO: { lat: 28.4312, lng: -81.3081, name: 'Orlando Intl', tz: 'America/New_York' },
  YVR: { lat: 49.1947, lng: -123.1792, name: 'Vancouver Intl', tz: 'America/Vancouver' },
  YUL: { lat: 45.4706, lng: -73.7408, name: 'Montreal Trudeau', tz: 'America/Toronto' },
  CUN: { lat: 21.0365, lng: -86.8771, name: 'Cancun Intl', tz: 'America/Cancun' },
  GIG: { lat: -22.8090, lng: -43.2436, name: 'Rio de Janeiro Galeão', tz: 'America/Sao_Paulo' },
  LIM: { lat: -12.0219, lng: -77.1143, name: 'Lima Jorge Chávez', tz: 'America/Lima' },
  AKL: { lat: -37.0082, lng: 174.7850, name: 'Auckland', tz: 'Pacific/Auckland' },
  MEL: { lat: -37.6690, lng: 144.8410, name: 'Melbourne', tz: 'Australia/Melbourne' },
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
  // US road-trip cities (Central) — the common cross-country stops paste plans hit.
  'st. louis': { lat: 38.6270, lng: -90.1994, tz: 'America/Chicago' },
  'memphis': { lat: 35.1495, lng: -90.0490, tz: 'America/Chicago' },
  'nashville': { lat: 36.1627, lng: -86.7816, tz: 'America/Chicago' },
  'new orleans': { lat: 29.9511, lng: -90.0715, tz: 'America/Chicago' },
  'houston': { lat: 29.7604, lng: -95.3698, tz: 'America/Chicago' },
  'dallas': { lat: 32.7767, lng: -96.7970, tz: 'America/Chicago' },
  'austin': { lat: 30.2672, lng: -97.7431, tz: 'America/Chicago' },
  'san antonio': { lat: 29.4241, lng: -98.4936, tz: 'America/Chicago' },
  'kansas city': { lat: 39.0997, lng: -94.5786, tz: 'America/Chicago' },
  'minneapolis': { lat: 44.9778, lng: -93.2650, tz: 'America/Chicago' },
  'milwaukee': { lat: 43.0389, lng: -87.9065, tz: 'America/Chicago' },
  'little rock': { lat: 34.7465, lng: -92.2896, tz: 'America/Chicago' },
  'oklahoma city': { lat: 35.4676, lng: -97.5164, tz: 'America/Chicago' },
  // US (Eastern)
  'atlanta': { lat: 33.7490, lng: -84.3880, tz: 'America/New_York' },
  'philadelphia': { lat: 39.9526, lng: -75.1652, tz: 'America/New_York' },
  'orlando': { lat: 28.5383, lng: -81.3792, tz: 'America/New_York' },
  'charlotte': { lat: 35.2271, lng: -80.8431, tz: 'America/New_York' },
  'pittsburgh': { lat: 40.4406, lng: -79.9959, tz: 'America/New_York' },
  'detroit': { lat: 42.3314, lng: -83.0458, tz: 'America/Detroit' },
  'indianapolis': { lat: 39.7684, lng: -86.1581, tz: 'America/Indiana/Indianapolis' },
  // US (Mountain / Pacific)
  'salt lake city': { lat: 40.7608, lng: -111.8910, tz: 'America/Denver' },
  'phoenix': { lat: 33.4484, lng: -112.0740, tz: 'America/Phoenix' },
  'sacramento': { lat: 38.5816, lng: -121.4944, tz: 'America/Los_Angeles' },
  // International (common multi-city stops)
  'berlin': { lat: 52.5200, lng: 13.4050, tz: 'Europe/Berlin' },
  'madrid': { lat: 40.4168, lng: -3.7038, tz: 'Europe/Madrid' },
  'venice': { lat: 45.4408, lng: 12.3155, tz: 'Europe/Rome' },
  'florence': { lat: 43.7696, lng: 11.2558, tz: 'Europe/Rome' },
  'bangkok': { lat: 13.7563, lng: 100.5018, tz: 'Asia/Bangkok' },
  'hong kong': { lat: 22.3193, lng: 114.1694, tz: 'Asia/Hong_Kong' },
  'mexico city': { lat: 19.4326, lng: -99.1332, tz: 'America/Mexico_City' },
  // Hawaii (beach trips)
  'honolulu': { lat: 21.3069, lng: -157.8583, tz: 'Pacific/Honolulu' },
  'maui': { lat: 20.7984, lng: -156.3319, tz: 'Pacific/Honolulu' },
  'kahului': { lat: 20.8893, lng: -156.4729, tz: 'Pacific/Honolulu' },
  'lahaina': { lat: 20.8783, lng: -156.6825, tz: 'Pacific/Honolulu' },
  // National-park gateway towns (Utah / nearby)
  'moab': { lat: 38.5733, lng: -109.5498, tz: 'America/Denver' },
  'springdale': { lat: 37.1889, lng: -113.0033, tz: 'America/Denver' },
  // Michigan road-trip stops
  'traverse city': { lat: 44.7631, lng: -85.6206, tz: 'America/Detroit' },
  'mackinaw city': { lat: 45.7775, lng: -84.7271, tz: 'America/Detroit' },
  'mackinac island': { lat: 45.8492, lng: -84.6189, tz: 'America/Detroit' },
  // More Europe
  'lisbon': { lat: 38.7223, lng: -9.1393, tz: 'Europe/Lisbon' },
  'vienna': { lat: 48.2082, lng: 16.3738, tz: 'Europe/Vienna' },
  'prague': { lat: 50.0755, lng: 14.4378, tz: 'Europe/Prague' },
  'munich': { lat: 48.1351, lng: 11.5820, tz: 'Europe/Berlin' },
  'dublin': { lat: 53.3498, lng: -6.2603, tz: 'Europe/Dublin' },
  'edinburgh': { lat: 55.9533, lng: -3.1883, tz: 'Europe/London' },
  'athens': { lat: 37.9838, lng: 23.7275, tz: 'Europe/Athens' },
  'istanbul': { lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' },
  'reykjavik': { lat: 64.1466, lng: -21.9426, tz: 'Atlantic/Reykjavik' },
  'nice': { lat: 43.7102, lng: 7.2620, tz: 'Europe/Paris' },
  'milan': { lat: 45.4642, lng: 9.1900, tz: 'Europe/Rome' },
  'naples': { lat: 40.8518, lng: 14.2681, tz: 'Europe/Rome' },
  // More Asia / Oceania
  'kyoto': { lat: 35.0116, lng: 135.7681, tz: 'Asia/Tokyo' },
  'osaka': { lat: 34.6937, lng: 135.5023, tz: 'Asia/Tokyo' },
  'seoul': { lat: 37.5665, lng: 126.9780, tz: 'Asia/Seoul' },
  'beijing': { lat: 39.9042, lng: 116.4074, tz: 'Asia/Shanghai' },
  'shanghai': { lat: 31.2304, lng: 121.4737, tz: 'Asia/Shanghai' },
  'kuala lumpur': { lat: 3.1390, lng: 101.6869, tz: 'Asia/Kuala_Lumpur' },
  'bali': { lat: -8.4095, lng: 115.1889, tz: 'Asia/Makassar' },
  'melbourne': { lat: -37.8136, lng: 144.9631, tz: 'Australia/Melbourne' },
  'auckland': { lat: -36.8485, lng: 174.7633, tz: 'Pacific/Auckland' },
  // More Americas
  'vancouver': { lat: 49.2827, lng: -123.1207, tz: 'America/Vancouver' },
  'montreal': { lat: 45.5019, lng: -73.5674, tz: 'America/Toronto' },
  'cancun': { lat: 21.1619, lng: -86.8515, tz: 'America/Cancun' },
  'rio de janeiro': { lat: -22.9068, lng: -43.1729, tz: 'America/Sao_Paulo' },
  'lima': { lat: -12.0464, lng: -77.0428, tz: 'America/Lima' },
  // Ski towns (US / Canada)
  'aspen': { lat: 39.1911, lng: -106.8175, tz: 'America/Denver' },
  'vail': { lat: 39.6403, lng: -106.3742, tz: 'America/Denver' },
  'park city': { lat: 40.6461, lng: -111.4980, tz: 'America/Denver' },
  'south lake tahoe': { lat: 38.9399, lng: -119.9772, tz: 'America/Los_Angeles' },
  'banff': { lat: 51.1784, lng: -115.5708, tz: 'America/Edmonton' },
  'whistler': { lat: 50.1163, lng: -122.9574, tz: 'America/Vancouver' },
  // Cruise / coastal US
  'fort lauderdale': { lat: 26.1224, lng: -80.1373, tz: 'America/New_York' },
  'galveston': { lat: 29.3013, lng: -94.7977, tz: 'America/Chicago' },
  'anchorage': { lat: 61.2181, lng: -149.9003, tz: 'America/Anchorage' },
  // US leisure / weekend cities
  'savannah': { lat: 32.0809, lng: -81.0912, tz: 'America/New_York' },
  'charleston': { lat: 32.7765, lng: -79.9311, tz: 'America/New_York' },
  'asheville': { lat: 35.5951, lng: -82.5515, tz: 'America/New_York' },
  'tampa': { lat: 27.9506, lng: -82.4572, tz: 'America/New_York' },
  'santa fe': { lat: 35.6870, lng: -105.9378, tz: 'America/Denver' },
  'jackson hole': { lat: 43.4799, lng: -110.7624, tz: 'America/Boise' },   // Mountain (tz-lookup polygon → Boise)
  'sedona': { lat: 34.8697, lng: -111.7610, tz: 'America/Phoenix' },
  'tucson': { lat: 32.2226, lng: -110.9747, tz: 'America/Phoenix' },
  'key west': { lat: 24.5551, lng: -81.7800, tz: 'America/New_York' },
  'san jose': { lat: 37.3382, lng: -121.8863, tz: 'America/Los_Angeles' },
  'napa': { lat: 38.2975, lng: -122.2869, tz: 'America/Los_Angeles' },
  'monterey': { lat: 36.6002, lng: -121.8947, tz: 'America/Los_Angeles' },
  'santa barbara': { lat: 34.4208, lng: -119.6982, tz: 'America/Los_Angeles' },
  'palm springs': { lat: 33.8303, lng: -116.5453, tz: 'America/Los_Angeles' },
  // More Europe
  'zurich': { lat: 47.3769, lng: 8.5417, tz: 'Europe/Zurich' },
  'geneva': { lat: 46.2044, lng: 6.1432, tz: 'Europe/Zurich' },
  'brussels': { lat: 50.8503, lng: 4.3517, tz: 'Europe/Brussels' },
  'copenhagen': { lat: 55.6761, lng: 12.5683, tz: 'Europe/Copenhagen' },
  'stockholm': { lat: 59.3293, lng: 18.0686, tz: 'Europe/Stockholm' },
  'oslo': { lat: 59.9139, lng: 10.7522, tz: 'Europe/Oslo' },
  'budapest': { lat: 47.4979, lng: 19.0402, tz: 'Europe/Budapest' },
  'krakow': { lat: 50.0647, lng: 19.9450, tz: 'Europe/Warsaw' },
  'porto': { lat: 41.1579, lng: -8.6291, tz: 'Europe/Lisbon' },
  'seville': { lat: 37.3891, lng: -5.9845, tz: 'Europe/Madrid' },
  'frankfurt': { lat: 50.1109, lng: 8.6821, tz: 'Europe/Berlin' },
  // Middle East / Africa
  'abu dhabi': { lat: 24.4539, lng: 54.3773, tz: 'Asia/Dubai' },
  'doha': { lat: 25.2854, lng: 51.5310, tz: 'Asia/Qatar' },
  'tel aviv': { lat: 32.0853, lng: 34.7818, tz: 'Asia/Jerusalem' },
  'marrakech': { lat: 31.6295, lng: -7.9811, tz: 'Africa/Casablanca' },
  'cairo': { lat: 30.0444, lng: 31.2357, tz: 'Africa/Cairo' },
  'cape town': { lat: -33.9249, lng: 18.4241, tz: 'Africa/Johannesburg' },
  // More Asia
  'taipei': { lat: 25.0330, lng: 121.5654, tz: 'Asia/Taipei' },
  'phuket': { lat: 7.8804, lng: 98.3923, tz: 'Asia/Bangkok' },
  'chiang mai': { lat: 18.7883, lng: 98.9853, tz: 'Asia/Bangkok' },
  'mumbai': { lat: 19.0760, lng: 72.8777, tz: 'Asia/Kolkata' },
  'delhi': { lat: 28.6139, lng: 77.2090, tz: 'Asia/Kolkata' },
  'jaipur': { lat: 26.9124, lng: 75.7873, tz: 'Asia/Kolkata' },
  // More Americas
  'buenos aires': { lat: -34.6037, lng: -58.3816, tz: 'America/Argentina/Buenos_Aires' },
  'santiago': { lat: -33.4489, lng: -70.6693, tz: 'America/Santiago' },
  'bogota': { lat: 4.7110, lng: -74.0721, tz: 'America/Bogota' },
  'cusco': { lat: -13.5319, lng: -71.9675, tz: 'America/Lima' },
  'san juan': { lat: 18.4655, lng: -66.1057, tz: 'America/Puerto_Rico' },
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
