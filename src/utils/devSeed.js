/**
 * devSeed.js — DEV-ONLY one-tap demo trips for on-device verification.
 *
 * Not shipped: the only caller is a `__DEV__`-gated menu on the Home screen. Each demo builds a
 * real trip through the normal store actions (createTrip + addActivity / the paste importer), so
 * it matches the live schema exactly. DEMO_SEEDS is the registry the Home menu renders.
 */
import { todayISO } from './helpers';
import { importTripFromText } from './itineraryImport';

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Real coordinates so tz-lookup resolves zones.
const ORD = { lat: 41.9742, lng: -87.9073 };   // Chicago O'Hare — America/Chicago (Central)
const LAX = { lat: 33.9416, lng: -118.4085 };  // LAX — America/Los_Angeles (Pacific)
const SM  = { lat: 34.0195, lng: -118.4912 };  // Santa Monica
const LAH = { lat: 34.0407, lng: -118.2468 };  // Downtown LA
const SD  = { lat: 32.7113, lng: -117.1601 };  // San Diego (Gaslamp)
const ZOO = { lat: 32.7353, lng: -117.1490 };  // San Diego Zoo
const CHI = { lat: 41.8781, lng: -87.6298 };   // Chicago downtown
const NRT = { lat: 35.7720, lng: 140.3929 };   // Tokyo Narita — Asia/Tokyo (JST, +9)
const SHIBUYA = { lat: 35.6595, lng: 139.7005 };
const SENSOJI = { lat: 35.7148, lng: 139.7967 };
const SHINJUKU = { lat: 35.6938, lng: 139.7034 };
const DELLS = { lat: 43.6275, lng: -89.7710 };  // Wisconsin Dells — America/Chicago (Central)

// ── Demo 1: cross-zone US road trip (Central ↔ Pacific) — starts today (a "happening" trip). ──
export function seedCrossZoneDemo(store) {
  const start = todayISO();
  const trip = store.createTrip({
    name: 'ORD → LAX → San Diego',
    destination: 'Los Angeles & San Diego',
    startDate: start, endDate: addDaysISO(start, 4), mode: 'manual', pace: 'moderate', budget: 'mid-range', focus: [],
    origin: { label: "Chicago O'Hare (ORD)", ...ORD },
    familyForms: [{ name: 'Demo Family', members: [{ name: 'Alex', age: '34' }, { name: 'Sam', age: '9' }] }],
  });
  const add = (i, a) => store.addActivity(trip.id, i, a);
  add(0, { type: 'transport', subtype: 'flight', time: '08:00', arriveTime: '10:30', name: 'Flight ORD → LAX', costPerPerson: 220, ...LAX });
  add(0, { type: 'food', time: '13:00', name: 'Lunch in Santa Monica', costPerPerson: 25, ...SM });
  add(0, { type: 'stay', time: '15:00', name: 'Hotel — Los Angeles', nights: 1, costPerPerson: 0, ...LAH });
  add(1, { type: 'transport', subtype: 'car', time: '09:00', arriveTime: '11:30', name: 'Drive to San Diego', ...SD });
  add(1, { type: 'activity', time: '13:00', name: 'Balboa Park', costPerPerson: 0, ...ZOO });
  add(1, { type: 'stay', time: '16:00', name: 'Hotel — San Diego', nights: 2, costPerPerson: 0, ...SD });
  add(2, { type: 'activity', time: '10:00', name: 'San Diego Zoo', costPerPerson: 70, ...ZOO });
  add(2, { type: 'food', time: '19:00', name: 'Dinner in the Gaslamp', costPerPerson: 40, ...SD });
  add(3, { type: 'transport', subtype: 'car', time: '10:00', arriveTime: '12:30', name: 'Drive to LAX', ...LAX });
  add(3, { type: 'transport', subtype: 'flight', time: '15:00', arriveTime: '21:00', name: 'Flight LAX → ORD', costPerPerson: 220, ...ORD });
  add(4, { type: 'food', time: '11:00', name: 'Welcome-home brunch', costPerPerson: 20, ...CHI });
  return trip;
}

// ── Demo 2: international + RED-EYE (Central → Tokyo JST, the +1-day leg label + GMT+9 flags). ──
export function seedTokyoDemo(store) {
  const start = todayISO();
  const trip = store.createTrip({
    name: 'Chicago → Tokyo',
    destination: 'Tokyo',
    startDate: start, endDate: addDaysISO(start, 4), mode: 'manual', pace: 'moderate', budget: 'mid-range', focus: [],
    origin: { label: "Chicago O'Hare (ORD)", ...ORD },
    familyForms: [{ name: 'Demo Family', members: [{ name: 'Riku', age: '30' }] }],
  });
  const add = (i, a) => store.addActivity(trip.id, i, a);
  // Depart 11:00 CDT, "arrive" 15:00 JST → lands the next calendar day (red-eye / +1 day).
  add(0, { type: 'transport', subtype: 'flight', time: '11:00', arriveTime: '15:00', name: 'Flight ORD → Tokyo (NRT)', costPerPerson: 950, ...NRT });
  add(1, { type: 'stay', time: '16:00', name: 'Hotel — Shibuya', nights: 3, costPerPerson: 0, ...SHIBUYA });
  add(1, { type: 'food', time: '19:00', name: 'Dinner in Shibuya', costPerPerson: 35, ...SHIBUYA });
  add(2, { type: 'activity', time: '09:30', name: 'Sensō-ji Temple', costPerPerson: 0, ...SENSOJI });
  add(2, { type: 'activity', time: '15:00', name: 'Shinjuku & Gardens', costPerPerson: 10, ...SHINJUKU });
  add(3, { type: 'activity', time: '10:00', name: 'Shibuya Crossing & shopping', costPerPerson: 0, ...SHIBUYA });
  add(4, { type: 'transport', subtype: 'flight', time: '17:00', arriveTime: '15:00', name: 'Flight Tokyo (NRT) → ORD', costPerPerson: 950, ...ORD });
  return trip;
}

// ── Demo 3: multi-family split (the Splitwise moat — shared hotel + per-family costs, By Group). ──
export function seedMultiFamilyDemo(store) {
  const start = addDaysISO(todayISO(), 14);   // upcoming, so it's a clean planning view
  const trip = store.createTrip({
    name: 'Families @ Wisconsin Dells',
    destination: 'Wisconsin Dells',
    startDate: start, endDate: addDaysISO(start, 2), mode: 'manual', pace: 'relaxed', budget: 'mid-range', focus: [],
    origin: { label: 'Chicago', ...CHI },
    familyForms: [
      { name: 'The Smiths', members: [{ name: 'Jon', age: '40' }, { name: 'Jane', age: '38' }, { name: 'Mia', age: '7' }] },
      { name: 'The Lees', members: [{ name: 'Sam', age: '41' }, { name: 'Pat', age: '39' }] },
    ],
  });
  const add = (i, a) => store.addActivity(trip.id, i, a);
  add(0, { type: 'transport', subtype: 'car', time: '09:00', arriveTime: '12:00', name: 'Drive to the Dells', ...DELLS });
  add(0, { type: 'stay', time: '15:00', name: 'Great Wolf Lodge', nights: 2, costPerPerson: 0, ...DELLS });
  add(0, { type: 'food', time: '19:00', name: 'Group dinner', costPerPerson: 28, ...DELLS });
  add(1, { type: 'activity', time: '10:00', name: 'Indoor water park', costPerPerson: 55, ...DELLS });
  add(1, { type: 'food', time: '13:00', name: 'Lunch', costPerPerson: 18, ...DELLS });
  add(1, { type: 'activity', time: '15:30', name: 'Mini-golf & arcade', costPerPerson: 22, ...DELLS });
  add(2, { type: 'food', time: '09:00', name: 'Farewell breakfast', costPerPerson: 16, ...DELLS });
  add(2, { type: 'transport', subtype: 'car', time: '11:00', arriveTime: '14:00', name: 'Drive home', ...CHI });
  return trip;
}

// ── Demo 4: built from a PASTED AI plan (no manual entry) — the paste-to-trip flow, offline. ──
const PASTE_SAMPLE = `Segment 1: Los Angeles (June 30 – July 3)
June 30: Arrival & Santa Monica
Land at LAX, grab your rental car, and head to the coast.
Spend the afternoon at the Santa Monica Pier.
July 1: Hollywood & Griffith Observatory
Morning: Hike the trails at Griffith Park.
Afternoon: Explore the Griffith Observatory.
Evening: Dinner in West Hollywood.
July 2: Theme Park or Museum Day
Option A: Universal Studios Hollywood.
Option B: The Getty Center and LACMA.
Segment 2: San Diego (July 3 – July 5)
July 3: Coastal drive to San Diego
Check out of your LA hotel.
Stop 1 (Laguna Beach): Stroll around Heisler Park.
July 4: Balboa Park & Zoo
Morning: Balboa Park.
Afternoon: San Diego Zoo.
July 5: Departure
Check out of your San Diego hotel.
Drive back to LAX and catch your flight home.`;

export function seedPastedDemo(store) {
  const r = importTripFromText(store, PASTE_SAMPLE, { year: new Date().getFullYear() + 1 });
  return r && r.trip;
}

// Registry the Home dev menu renders. Each run(store) returns the created trip.
export const DEMO_SEEDS = [
  { key: 'crosszone',   label: 'ORD ↔ LAX ↔ SD (timezones)', run: seedCrossZoneDemo },
  { key: 'tokyo',       label: 'Chicago → Tokyo (red-eye)',  run: seedTokyoDemo },
  { key: 'multifamily', label: 'Multi-family (split)',       run: seedMultiFamilyDemo },
  { key: 'pasted',      label: 'Built from a pasted plan',   run: seedPastedDemo },
];
