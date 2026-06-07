/**
 * devSeed.js — DEV-ONLY one-tap demo trips for on-device verification.
 *
 * Not shipped: the only caller is a `__DEV__`-gated button on the Home screen. Builds a real
 * trip through the normal store actions (createTrip + addActivity), so it matches the live
 * schema exactly (no hand-rolled trip object to drift).
 */
import { todayISO } from './helpers';

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// Coordinates (lat,lng) for the stops — real, so tz-lookup resolves the zones.
const ORD = { lat: 41.9742, lng: -87.9073 };   // Chicago O'Hare — America/Chicago (Central)
const LAX = { lat: 33.9416, lng: -118.4085 };  // LAX — America/Los_Angeles (Pacific)
const SM  = { lat: 34.0195, lng: -118.4912 };  // Santa Monica
const LAH = { lat: 34.0407, lng: -118.2468 };  // Downtown LA
const SD  = { lat: 32.7113, lng: -117.1601 };  // San Diego (Gaslamp)
const ZOO = { lat: 32.7353, lng: -117.1490 };  // San Diego Zoo
const CHI = { lat: 41.8781, lng: -87.6298 };   // Chicago downtown

/**
 * Builds the ORD → LAX → San Diego → ORD demo. Starts TODAY (a "happening" trip) so it also
 * exercises open-to-now + the past auto-lock. Crosses Central↔Pacific on both flights (→ leg
 * labels CDT→PDT and PDT→CDT) and has a same-zone LA→SD drive (→ no leg label, both PDT).
 * Returns the created trip (already in the store).
 */
export function seedCrossZoneDemo(store) {
  const start = todayISO();
  const trip = store.createTrip({
    name: 'ORD → LAX → San Diego',
    destination: 'Los Angeles & San Diego',
    startDate: start,
    endDate: addDaysISO(start, 4),     // 5 days
    mode: 'manual',
    pace: 'moderate',
    budget: 'mid-range',
    focus: [],
    origin: { label: "Chicago O'Hare (ORD)", ...ORD },
    familyForms: [{ name: 'Demo Family', members: [{ name: 'Alex', age: '34' }, { name: 'Sam', age: '9' }] }],
  });
  const add = (dayIdx, a) => store.addActivity(trip.id, dayIdx, a);

  // Day 1 — fly ORD → LAX (Central → Pacific), then settle in LA.
  add(0, { type: 'transport', subtype: 'flight', time: '08:00', arriveTime: '10:30', name: 'Flight ORD → LAX', costPerPerson: 220, ...LAX });
  add(0, { type: 'food', time: '13:00', name: 'Lunch in Santa Monica', costPerPerson: 25, ...SM });
  add(0, { type: 'stay', time: '15:00', name: 'Hotel — Los Angeles', nights: 1, costPerPerson: 0, ...LAH });

  // Day 2 — road trip LA → San Diego (BOTH Pacific → no zone-change label on this leg).
  add(1, { type: 'transport', subtype: 'car', time: '09:00', arriveTime: '11:30', name: 'Drive to San Diego', ...SD });
  add(1, { type: 'activity', time: '13:00', name: 'Balboa Park', costPerPerson: 0, ...ZOO });
  add(1, { type: 'stay', time: '16:00', name: 'Hotel — San Diego', nights: 2, costPerPerson: 0, ...SD });

  // Day 3 — San Diego (all Pacific).
  add(2, { type: 'activity', time: '10:00', name: 'San Diego Zoo', costPerPerson: 70, ...ZOO });
  add(2, { type: 'food', time: '19:00', name: 'Dinner in the Gaslamp', costPerPerson: 40, ...SD });

  // Day 4 — drive back to LAX, then fly LAX → ORD (Pacific → Central → leg label PDT→CDT).
  add(3, { type: 'transport', subtype: 'car', time: '10:00', arriveTime: '12:30', name: 'Drive to LAX', ...LAX });
  add(3, { type: 'transport', subtype: 'flight', time: '15:00', arriveTime: '21:00', name: 'Flight LAX → ORD', costPerPerson: 220, ...ORD });

  // Day 5 — back home in Chicago (Central → CDT again).
  add(4, { type: 'food', time: '11:00', name: 'Welcome-home brunch', costPerPerson: 20, ...CHI });

  return trip;
}
