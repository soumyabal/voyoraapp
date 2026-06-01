/**
 * TransitAgent.js
 *
 * PARALLEL (Promise.all) · Phase 1: mock data  · Phase 2: Google Maps + Skyscanner
 *
 * Determines best transit options for the trip:
 *   - Arrival/departure (fly vs drive vs train)
 *   - Multi-city routing (if notes mention multiple cities)
 *   - Local transport within destination
 *   - Accessibility requirements
 *
 * Phase 2: swap mockRoutes() for real Google Maps Directions + Skyscanner Affiliate.
 */

// ─── Route database ───────────────────────────────────────────────────────────
// Same data as plannerAPI but structured for agent output format

const ROUTES = {
  'San Diego→Los Angeles': {
    recommended: 'drive',
    options: [
      { mode: 'drive', emoji: '🚗', duration: '~2.5 hrs', costPerPerson: 12, detail: 'I-5 North · 120 miles. Scenic PCH via Oceanside option.', wheelchairOk: true, strollerOk: true },
      { mode: 'train', emoji: '🚂', duration: '~3 hrs',   costPerPerson: 37, detail: 'Pacific Surfliner — Santa Fe Depot to Union Station. Very scenic coastal route.', wheelchairOk: true, strollerOk: true },
      { mode: 'fly',   emoji: '✈️', duration: '~1 hr + airport', costPerPerson: 85, detail: 'SAN to LAX/BUR/LGB — airport time makes driving faster for this distance.', wheelchairOk: true, strollerOk: true },
    ],
  },
  'Los Angeles→San Diego': {
    recommended: 'drive',
    options: [
      { mode: 'drive', emoji: '🚗', duration: '~2.5 hrs', costPerPerson: 12, detail: 'I-5 South · Avoid rush hour — leave before 7am or after 10am.', wheelchairOk: true, strollerOk: true },
      { mode: 'train', emoji: '🚂', duration: '~3 hrs',   costPerPerson: 37, detail: 'Pacific Surfliner from Union Station to Santa Fe Depot. Relaxing with coastal views.', wheelchairOk: true, strollerOk: true },
      { mode: 'fly',   emoji: '✈️', duration: '~1 hr + airport', costPerPerson: 85, detail: 'LAX to SAN — usually slower than driving door-to-door.', wheelchairOk: true, strollerOk: true },
    ],
  },
  'Los Angeles→San Francisco': {
    recommended: 'fly',
    options: [
      { mode: 'fly',   emoji: '✈️', duration: '~1.5 hrs', costPerPerson: 95, detail: 'LAX to SFO/OAK. Many daily flights. Book 2–3 weeks ahead for best prices.', wheelchairOk: true, strollerOk: true },
      { mode: 'drive', emoji: '🚗', duration: '~5.5 hrs',  costPerPerson: 25, detail: 'I-5 North (fastest) or scenic Hwy 1 (add 3+ hrs but stunning).', wheelchairOk: true, strollerOk: true },
      { mode: 'train', emoji: '🚂', duration: '~8 hrs',    costPerPerson: 65, detail: 'Amtrak Coast Starlight — overnight option, scenic.', wheelchairOk: true, strollerOk: true },
    ],
  },
  'San Francisco→Los Angeles': {
    recommended: 'fly',
    options: [
      { mode: 'fly',   emoji: '✈️', duration: '~1.5 hrs', costPerPerson: 95, detail: 'SFO/OAK to LAX. Multiple daily options.', wheelchairOk: true, strollerOk: true },
      { mode: 'drive', emoji: '🚗', duration: '~5.5 hrs',  costPerPerson: 25, detail: 'I-5 South (fastest). Hwy 1 is stunning — add 3+ hours.', wheelchairOk: true, strollerOk: true },
      { mode: 'train', emoji: '🚂', duration: '~8 hrs',    costPerPerson: 65, detail: 'Amtrak Coast Starlight — book a sleeper for families.', wheelchairOk: true, strollerOk: true },
    ],
  },
  'San Diego→San Francisco': {
    recommended: 'fly',
    options: [
      { mode: 'fly',   emoji: '✈️', duration: '~1.5 hrs', costPerPerson: 110, detail: 'SAN to SFO. Several daily flights.', wheelchairOk: true, strollerOk: true },
      { mode: 'drive', emoji: '🚗', duration: '~8 hrs',    costPerPerson: 30, detail: 'I-5 or I-405 North. Long day — consider stopping in LA.', wheelchairOk: true, strollerOk: true },
    ],
  },
};

// Local transport options per destination
const LOCAL_TRANSIT = {
  'san diego': {
    recommended: 'rental car',
    note: 'San Diego is car-friendly. Rental car gives flexibility for Zoo, beaches, Old Town. Uber/Lyft for downtown.',
    wheelchairNote: 'MTS buses and trolley are accessible. WheelTrans paratransit available.',
    strollerNote: 'Car is best for stroller transport. Most attractions have accessible drop-off.',
  },
  'los angeles': {
    recommended: 'rental car + Uber',
    note: 'LA requires a car. Uber/Lyft for Hollywood/West Side. Metro line connects downtown to Santa Monica (E line).',
    wheelchairNote: 'All LA Metro lines are accessible. Amtrak accessible seating available.',
    strollerNote: 'Rental car or large Uber/Lyft for stroller. Metro allows folded strollers.',
  },
  'san francisco': {
    recommended: 'BART + Muni + walking',
    note: 'SF is very walkable. BART from airport + Muni for city travel. Avoid renting a car (hills + parking).',
    wheelchairNote: 'All BART stations are accessible. Cable cars NOT wheelchair accessible — take historic streetcar instead.',
    strollerNote: 'Stroller works well in Fisherman\'s Wharf and flat areas. North Beach and Mission are stroller-friendly.',
  },
  'las vegas': {
    recommended: 'walking + The Deuce bus',
    note: 'The Strip is walkable (2.5 miles). The Deuce bus runs the full Strip 24/7 ($8 day pass). Monorail covers east side.',
    wheelchairNote: 'All Strip casinos are wheelchair accessible. The Deuce buses are lift-equipped.',
    strollerNote: 'Strip sidewalks are stroller-friendly. Use The Deuce for longer distances.',
  },
};

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * run(groupProfile, trip, notes) → TransitResult
 *
 * TransitResult: {
 *   arrival:    TransitOption | null   (inter-city arrival)
 *   departure:  TransitOption | null   (inter-city departure)
 *   multiCity:  MultiCityLeg[] | null  (if multi-city detected in notes)
 *   local:      LocalTransit
 * }
 */
export async function run(groupProfile, trip, notes) {
  const dest      = (trip.destination || '').split(',')[0].trim();
  const origin    = trip.origin || null; // Phase 2: add origin field to trip
  const notesLow  = (notes || '').toLowerCase();
  const cityKey   = dest.toLowerCase();

  // ── Multi-city detection (simple pattern match for Phase 1) ────────────────
  let multiCity = null;
  const cityMentions = [];
  const cityNames = ['san diego', 'los angeles', 'san francisco', 'las vegas', 'new york', 'seattle', 'portland', 'chicago', 'miami', 'orlando', 'denver', 'boston'];
  cityNames.forEach(city => {
    if (notesLow.includes(city)) cityMentions.push(city);
  });

  if (cityMentions.length >= 2) {
    multiCity = cityMentions.map((city, i) => {
      const prev = cityMentions[i - 1];
      if (!prev) return { city, transitFrom: null };
      const routeKey = `${capitalizeCity(prev)}→${capitalizeCity(city)}`;
      const route = ROUTES[routeKey];
      const recommended = route ? route.options.find(o => o.mode === route.recommended) || route.options[0] : null;
      return {
        city,
        transitFrom: prev,
        routeKey,
        recommended,
        allOptions: route?.options || [],
      };
    });
  }

  // ── Local transport ────────────────────────────────────────────────────────
  const local = LOCAL_TRANSIT[cityKey] || {
    recommended: 'local transport',
    note: 'Check local transport options on arrival. Uber/Lyft widely available.',
    wheelchairNote: groupProfile.hasWheelchair ? 'Request accessible vehicles when booking rides.' : null,
    strollerNote: groupProfile.hasStroller ? 'Confirm stroller space when booking vehicles.' : null,
  };

  // ── Arrival/departure (if origin known or typical arrival context) ─────────
  let arrival = null;
  if (origin) {
    const routeKey = `${origin}→${dest}`;
    const route    = ROUTES[routeKey];
    if (route) {
      const option = route.options.find(o => o.mode === route.recommended) || route.options[0];
      arrival = { ...option, from: origin, to: dest };
    }
  }

  // ── Accessibility overrides ────────────────────────────────────────────────
  const accessNotes = [];
  if (groupProfile.hasWheelchair) accessNotes.push('Wheelchair-accessible transport required at every leg');
  if (groupProfile.hasStroller)   accessNotes.push('Stroller transport — confirm luggage space or use foldable stroller');
  if (groupProfile.hasInfants)    accessNotes.push('Infant car seat required for road/taxi transport');
  if (groupProfile.hasElders)     accessNotes.push('Consider door-to-door transfers for elderly travelers — avoid long walks in transit hubs');

  return {
    arrival,
    departure: arrival ? { ...arrival, from: dest, to: origin } : null,
    multiCity,
    local: { ...local, accessNotes },
    destination: dest,
  };
}

function capitalizeCity(city) {
  return city.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
