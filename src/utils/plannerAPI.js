/**
 * plannerAPI.js — Voyara AI Planning Engine
 *
 * Call order:
 *   1. Real Claude API  (if CLAUDE_API_KEY is set in config.js)
 *   2. Known-destination DB (itineraryPlanner.js) with note overrides
 *   3. Smart generic fallback (buildGenericPlan)
 *
 * All three paths produce the same shape: Array<Array<Activity>>
 */

import { CLAUDE_API_KEY, CLAUDE_MODEL, CLAUDE_API_URL } from '../config';
import { generateSmartItinerary, profileGroup, SD_ACTIVITIES, SFO_ACTIVITIES } from './itineraryPlanner';
import { buildSystemPrompt, buildPlanPrompt, buildRefinementPrompt, parsePlanResponse } from './plannerRules';
import { uid } from './helpers';

// ─── City alias map ───────────────────────────────────────────────────────────

const CITY_ALIASES = {
  'san diego': 'San Diego', 'sd': 'San Diego', 's.d.': 'San Diego',
  'los angeles': 'Los Angeles', 'la': 'Los Angeles', 'l.a.': 'Los Angeles', 'socal': 'Los Angeles',
  'san francisco': 'San Francisco', 'sf': 'San Francisco', 's.f.': 'San Francisco', 'sfo': 'San Francisco', 'bay area': 'San Francisco',
  'anaheim': 'Anaheim', 'disneyland': 'Anaheim',
  'santa barbara': 'Santa Barbara',
  'palm springs': 'Palm Springs',
  'las vegas': 'Las Vegas', 'vegas': 'Las Vegas',
  'new york': 'New York', 'nyc': 'New York', 'new york city': 'New York',
  'chicago': 'Chicago',
  'miami': 'Miami',
  'orlando': 'Orlando',
  'seattle': 'Seattle',
  'portland': 'Portland',
  'denver': 'Denver',
  'boston': 'Boston',
};

function resolveCity(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim().replace(/[.,!?]$/, '');
  return CITY_ALIASES[lower] || null;
}

// ─── Transit route database ───────────────────────────────────────────────────

// TRANSIT_ROUTES[key] = { drive: {...}, fly: {...}, train: {...} }
// Each mode: { emoji, time, detail, alt, costBase }
const TRANSIT_ROUTES = {
  'San Diego→Los Angeles': {
    drive: { emoji: '🚗', time: '~2.5 hrs', detail: 'Drive I-5 North · 120 miles. Take PCH via Oceanside for a scenic coastal stretch.', costBase: 15 },
    train: { emoji: '🚂', time: '~3 hrs', detail: 'Pacific Surfliner from Santa Fe Depot (San Diego) to Union Station (LA) · Very scenic coastal route', costBase: 37 },
    fly:   { emoji: '✈️', time: '~1 hr + airport time', detail: 'SAN to LAX/BUR/LGB — short flight but airport time makes driving faster for this route', costBase: 75 },
  },
  'Los Angeles→San Diego': {
    drive: { emoji: '🚗', time: '~2.5 hrs', detail: 'Drive I-5 South · 120 miles. Avoid rush hour — leave before 7am or after 10am.', costBase: 15 },
    train: { emoji: '🚂', time: '~3 hrs', detail: 'Pacific Surfliner from Union Station (LA) to Santa Fe Depot (San Diego) · Scenic and relaxing', costBase: 37 },
    fly:   { emoji: '✈️', time: '~1 hr + airport time', detail: 'LAX to SAN — driving is usually faster for this short route', costBase: 75 },
  },
  'Los Angeles→San Francisco': {
    fly:   { emoji: '✈️', time: '~1.5 hrs', detail: 'Fly LAX to SFO or OAK · Many daily flights. Book in advance for best prices.', costBase: 95 },
    drive: { emoji: '🚗', time: '~5.5 hrs', detail: 'Drive I-5 North (fastest) or scenic Hwy 1 along the coast (~8+ hrs but stunning)', costBase: 25 },
    train: { emoji: '🚂', time: '~8 hrs', detail: 'Amtrak Coast Starlight from Union Station LA to Emeryville (SFO area) — scenic overnight option', costBase: 65 },
  },
  'San Francisco→Los Angeles': {
    fly:   { emoji: '✈️', time: '~1.5 hrs', detail: 'Fly SFO or OAK to LAX · Multiple daily options', costBase: 95 },
    drive: { emoji: '🚗', time: '~5.5 hrs', detail: 'Drive I-5 South (fastest). Hwy 1 is stunning but add 3+ hours.', costBase: 25 },
    train: { emoji: '🚂', time: '~8 hrs', detail: 'Amtrak Coast Starlight — scenic, book a sleeper for families', costBase: 65 },
  },
  'San Diego→San Francisco': {
    fly:   { emoji: '✈️', time: '~1.5 hrs', detail: 'Fly SAN to SFO · Several daily flights', costBase: 110 },
    drive: { emoji: '🚗', time: '~8 hrs', detail: 'Drive via I-5 or I-405 North — long day drive, consider stopping in LA', costBase: 30 },
    train: { emoji: '🚂', time: '~12 hrs', detail: 'Amtrak Pacific Surfliner to LA then Coast Starlight — scenic but very long', costBase: 80 },
  },
  'San Francisco→San Diego': {
    fly:   { emoji: '✈️', time: '~1.5 hrs', detail: 'Fly SFO to SAN', costBase: 110 },
    drive: { emoji: '🚗', time: '~8 hrs', detail: 'Drive I-5 South', costBase: 30 },
    train: { emoji: '🚂', time: '~12 hrs', detail: 'Amtrak Coast Starlight then Pacific Surfliner', costBase: 80 },
  },
};

function getTransitRoute(fromCity, toCity, preferredMode) {
  const key   = `${fromCity}→${toCity}`;
  const modes = TRANSIT_ROUTES[key];
  if (!modes) {
    return {
      emoji: '✈️', time: '~2 hrs',
      detail: `Check flights or transport options from ${fromCity} to ${toCity}`,
      costBase: 80, alt: null,
    };
  }
  // Use preferred mode if available, otherwise pick the best default
  const mode = (preferredMode && modes[preferredMode]) ? preferredMode
    : modes.fly   ? 'fly'
    : modes.drive ? 'drive'
    : 'train';
  const chosen = modes[mode];
  // Build alt string from other modes
  const alts = Object.entries(modes)
    .filter(([m]) => m !== mode)
    .map(([, r]) => `${r.emoji} ${r.time} (${r.detail.split('·')[0].trim()})`)
    .join(' · ');
  return { ...chosen, name: `${fromCity} → ${toCity}`, alt: alts || null };
}

// ─── Multi-city note parser ───────────────────────────────────────────────────

/**
 * parseMultiLeg(lower, n)
 *
 * Detects multi-city routing from notes. Handles:
 *   A→B          "first 3 days in San Diego then LA"
 *   A→B→A        "arrive LA, drive to San Diego 3 days, drive back to LA"
 *   A→B→C        "San Diego 2 days, then LA, then San Francisco"
 *
 * Returns Array<{city, days, transitMode}> (2+ items) or null.
 * transitMode: 'drive' | 'fly' | 'train' | null (null = use route default)
 */
function parseMultiLeg(lower, n) {
  // ── Global transport preference ───────────────────────────────────────────
  let globalMode = null;
  if (/\bwe('?ll)?\s+(drive|will\s+drive|are\s+driving)\b|\bby\s+car\b|\broad.?trip\b|\brent\w*\s+car\b|\bdriving\s+between\b/.test(lower)) globalMode = 'drive';
  else if (/\bwe('?ll)?\s+(fly|will\s+fly|are\s+flying)\b|\bby\s+plane\b|\bby\s+air\b|\bflying\s+between\b/.test(lower))                      globalMode = 'fly';

  // ── Scan for city mentions with optional day count + transport mode ───────
  // Sort aliases longest-first so "san francisco" matches before "san"
  const sortedAliases = Object.entries(CITY_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  const mentions = []; // { city, days, mode, pos }

  for (const [alias, city] of sortedAliases) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const idx = lower.indexOf(alias, searchFrom);
      if (idx === -1) break;

      // Ensure it's a word boundary (not mid-word)
      const before = idx > 0 ? lower[idx - 1] : ' ';
      const after  = idx + alias.length < lower.length ? lower[idx + alias.length] : ' ';
      if (/[a-z]/.test(before) || /[a-z]/.test(after)) { searchFrom = idx + 1; continue; }

      const context  = lower.slice(Math.max(0, idx - 50), idx + alias.length + 50);
      const pre      = lower.slice(Math.max(0, idx - 50), idx);
      const post     = lower.slice(idx + alias.length, Math.min(lower.length, idx + alias.length + 50));

      // Day count: "N days in CITY" or "CITY for N days"
      const daysBefore = pre.match(/(\d+)\s*(?:days?|nights?)\s+(?:in\s+)?$/);
      const daysAfter  = post.match(/^\s+for\s+(\d+)\s*(?:days?|nights?)/);
      const days       = parseInt((daysBefore && daysBefore[1]) || (daysAfter && daysAfter[1])) || null;

      // Transport mode: "drive to CITY", "fly to CITY", "flew back to CITY", "drive back to CITY"
      const modeMatch = pre.match(/\b(drive|drove|driv\w+|fly|flew|flight|train|amtrak)\s+(?:back\s+)?(?:to\s+)?(?:\w+\s+)?$/i);
      let mode = null;
      if (modeMatch) {
        const m = modeMatch[1].toLowerCase();
        mode = /fly|flew|flight/.test(m) ? 'fly' : /train|amtrak/.test(m) ? 'train' : 'drive';
      }

      mentions.push({ city, days, mode: mode || globalMode, pos: idx });
      searchFrom = idx + alias.length;
    }
  }

  if (mentions.length < 2) return null;

  // Sort by position in text
  mentions.sort((a, b) => a.pos - b.pos);

  // ── Deduplicate: merge consecutive same-city mentions ────────────────────
  const legs = [];
  for (const m of mentions) {
    const last = legs[legs.length - 1];
    if (last && last.city === m.city) {
      // Merge — keep the days/mode if not yet known
      if (!last.days && m.days) last.days = m.days;
      if (!last.mode && m.mode) last.mode = m.mode;
    } else {
      legs.push({ city: m.city, days: m.days, mode: m.mode });
    }
  }

  if (legs.length < 2) return null;

  // ── Detect return trip — last city matches first city ────────────────────
  // e.g. LA → SD → LA  (common pattern: arrive city, excursion, return)
  // The return transit mode might be "drive back", "fly back" which is already captured above.
  // If the last leg city === first leg city and legs.length === 3, it's a return trip.
  // (parseMultiLeg correctly handles this as-is — applyNoteOverrides builds transit for each adjacent pair)

  // ── Assign default days to legs that have none ──────────────────────────
  const transitCount   = legs.length - 1;
  const contentBudget  = Math.max(1, n - transitCount);
  const namedTotal     = legs.reduce((s, l) => s + (l.days || 0), 0);
  const unnamedCount   = legs.filter(l => !l.days).length;

  legs.forEach(leg => {
    if (!leg.days) {
      leg.days = unnamedCount > 0
        ? Math.max(1, Math.round((contentBudget - namedTotal) / unnamedCount))
        : Math.max(1, Math.round(contentBudget / legs.length));
    }
  });

  // ── Scale down if total exceeds trip length ───────────────────────────────
  let total = legs.reduce((s, l) => s + l.days, 0) + transitCount;
  let tries = 0;
  while (total > n && tries++ < 20) {
    const maxLeg = legs.reduce((best, l, i) => l.days > legs[best].days ? i : best, 0);
    if (legs[maxLeg].days <= 1) break;
    legs[maxLeg].days--;
    total--;
  }

  // ── Fill default transit modes ────────────────────────────────────────────
  legs.forEach((leg, i) => {
    if (i === 0) return;
    if (!leg.mode) {
      const route = getTransitRoute(legs[i - 1].city, leg.city);
      leg.mode = route.mode === '✈️' ? 'fly' : route.mode === '🚂' ? 'train' : 'drive';
    }
  });

  return legs;
}

// ─── Transit day builder ──────────────────────────────────────────────────────

function buildTransitDay(fromCity, toCity, budget, trip, preferredMode) {
  const scale  = c => scaleCost(c, budget);
  const route  = getTransitRoute(fromCity, toCity, preferredMode);
  const hCost  = hotelCostPerPerson(HOTEL_RATE[budget] || 160, trip);

  return [
    act({ type: 'food',      time: '07:30', name: `Breakfast — ${fromCity}`, detail: 'Early breakfast before checkout and travel day', access: 'Accessible', costPerPerson: scale(14) }),
    act({ type: 'stay',      time: '09:00', name: `Hotel checkout — ${fromCity}`, detail: 'Check out and consolidate luggage. Ask hotel to store bags if departure is later.', access: 'Accessible lobby', costPerPerson: 0, note: 'Great time to return a rental car or pick one up if driving to the next city.' }),
    act({ type: 'transport', time: '10:30', name: `${route.emoji || '🚌'} ${route.name}`, detail: route.detail, access: 'Accessible transport options available on request', costPerPerson: scale(route.costBase), note: route.alt || null, mapUrl: '' }),
    act({ type: 'food',      time: '14:00', name: `First lunch in ${toCity}`, detail: `Welcome to ${toCity} — explore near your hotel`, access: 'Accessible entrance', costPerPerson: scale(20) }),
    act({ type: 'stay',      time: '15:30', name: `Hotel check-in — ${toCity}`, detail: `New hotel in ${toCity}. Freshen up and get your bearings.`, access: 'Accessible rooms on request', costPerPerson: hCost, note: `Room rate: ~$${HOTEL_RATE[budget] || 160}/night per room · ${fromCity} leg is complete!` }),
    act({ type: 'activity',  time: '17:30', name: `First look around ${toCity}`, detail: `Short orientation walk near your hotel — scope out the neighbourhood`, access: 'Mostly flat routes available', costPerPerson: 0 }),
    act({ type: 'food',      time: '19:30', name: `Welcome dinner — ${toCity}`, detail: `Celebrate arriving in ${toCity}`, access: 'Accessible, advance booking for groups', costPerPerson: scale(35) }),
  ];
}

// ─── City-specific day builder (for multi-city simulation) ───────────────────

function buildCityDay(city, dayIndexInCity, profile, budget, isArrival, isDeparture, trip) {
  const scale   = c => scaleCost(c, budget);
  const hCost   = hotelCostPerPerson(HOTEL_RATE[budget] || 160, trip);
  const hNote   = `Room rate: ~$${HOTEL_RATE[budget] || 160}/night per room`;

  // For recognised cities, use the destination-specific builder from itineraryPlanner
  // We simulate by building a mini trip object and calling generateSmartItinerary
  const cityTrip = { ...trip, destination: city, days: Array.from({ length: 3 }, (_, i) => trip.days[i] || { label: `Day ${i+1}`, date: '', activities: [] }) };
  const cityPlan = generateSmartItinerary(cityTrip, []);

  if (cityPlan) {
    const dayIdx = isArrival ? 0 : isDeparture ? 2 : (dayIndexInCity % 3 === 0 ? 0 : dayIndexInCity % 3 === 1 ? 1 : 2);
    return (cityPlan[dayIdx] || cityPlan[0] || []).map(a => ({ ...a, id: uid() }));
  }

  // Generic fallback for unknown cities
  if (isArrival) return [
    act({ type: 'transport', time: '11:00', name: `Arrive ${city}`, detail: 'Transfer from airport or station to hotel', access: 'Accessible vehicle on request', costPerPerson: scale(25) }),
    act({ type: 'stay',      time: '14:00', name: `Hotel check-in — ${city}`, detail: 'Drop bags, freshen up, explore the neighbourhood', access: 'Accessible rooms on request', costPerPerson: hCost, note: hNote }),
    act({ type: 'food',      time: '15:30', name: 'Welcome lunch', detail: `First meal in ${city}`, access: 'Accessible entrance', costPerPerson: scale(20) }),
    act({ type: 'activity',  time: '17:30', name: `Explore ${city}`, detail: 'Orientation walk to get your bearings', access: 'Flat routes available', costPerPerson: 0 }),
    act({ type: 'food',      time: '19:30', name: 'Welcome dinner', detail: profile.hasKids ? 'Family-friendly local restaurant' : 'Local restaurant with evening ambience', access: 'Accessible', costPerPerson: scale(35) }),
  ];

  if (isDeparture) return [
    act({ type: 'food',      time: '08:00', name: 'Breakfast', detail: 'Last breakfast in the city', access: 'Accessible', costPerPerson: scale(14) }),
    act({ type: 'activity',  time: '09:30', name: `Final morning in ${city}`, detail: 'Last look at the highlights — pick up souvenirs', access: 'Accessible', costPerPerson: scale(10) }),
    act({ type: 'food',      time: '12:30', name: 'Farewell lunch', detail: `Last meal in ${city}`, access: 'Accessible', costPerPerson: scale(20) }),
    act({ type: 'stay',      time: '14:00', name: 'Hotel checkout', detail: 'Check out and store luggage if needed', access: 'Accessible lobby', costPerPerson: 0 }),
  ];

  const themes = [
    [act({ type: 'food', time: '08:00', name: 'Breakfast', costPerPerson: scale(14), access: 'Accessible', detail: 'Hotel or local café' }), act({ type: 'activity', time: '09:30', name: `${city} highlights`, detail: 'Top local attractions', access: 'Accessible routes available', costPerPerson: scale(20) }), act({ type: 'food', time: '13:00', name: 'Lunch', detail: 'Local restaurant', access: 'Accessible', costPerPerson: scale(18) }), act({ type: 'activity', time: '15:00', name: 'Afternoon sightseeing', detail: 'Museums, markets or parks', access: 'Accessible', costPerPerson: scale(12) }), act({ type: 'food', time: '19:30', name: 'Dinner', detail: 'Recommended local restaurant', access: 'Accessible', costPerPerson: scale(32) })],
  ];
  return themes[0];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const BUDGET_MULT = { budget: 0.65, 'mid-range': 1.0, luxury: 1.6 };
const HOTEL_RATE  = { budget: 85, 'mid-range': 160, luxury: 320 };

function scaleCost(cost, budget) {
  return Math.round(cost * (BUDGET_MULT[budget] || 1.0));
}

function act(overrides) {
  return {
    id: uid(), address: '', url: '', mapUrl: '',
    lat: null, lng: null, rating: null, note: null,
    access: '', detail: '',
    ...overrides,
  };
}

// ─── Real Claude API call ─────────────────────────────────────────────────────

/**
 * Calls the real Claude API with the rule-guide system prompt.
 * Returns Array<Array<Activity>> on success, null on failure / no key.
 *
 * @param {object} trip
 * @param {Array}  travelers
 * @param {object} options      { notes, pace, budget, focus }
 * @param {Function} onProgress  (msg: string) => void
 * @param {Array}  currentPlan  Existing plan (for refinement requests)
 * @param {string} refinement   User's chat refinement text (optional)
 */
async function callClaudeAPI(trip, travelers, options, onProgress, currentPlan, refinement) {
  if (!CLAUDE_API_KEY) return null;

  onProgress?.('Asking Claude AI…');

  const userPrompt = refinement
    ? buildRefinementPrompt(trip, travelers, options, currentPlan, refinement)
    : buildPlanPrompt(trip, travelers, options);
  const sysPrompt  = buildSystemPrompt();

  // Scale with trip length — same formula as ItineraryAgent
  const numDays   = trip?.days?.length || 7;
  const maxTokens = Math.min(60000, numDays * 1800 + 3000);
  console.log(`[plannerAPI] systemPrompt chars: ${sysPrompt.length}, userPrompt chars: ${userPrompt.length}, max_tokens: ${maxTokens} (${numDays} days)`);

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          CLAUDE_API_KEY,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: maxTokens,
        system:     sysPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn('[plannerAPI] Claude API error', res.status, JSON.stringify(errBody));
      return null;
    }

    const data   = await res.json();
    const text   = data?.content?.[0]?.text;
    const parsed = parsePlanResponse(text, trip.days?.length || 0);

    if (parsed) {
      onProgress?.('Plan received from Claude AI ✓');
      return parsed;
    }
    console.warn('[plannerAPI] Claude response could not be parsed — falling back');
    return null;
  } catch (err) {
    console.warn('[plannerAPI] Claude API fetch failed:', err.message);
    return null;
  }
}

// ─── Venue day-plan builders (simulation database) ────────────────────────────

function buildVenueDayPlan(venueKey, hasLunch, budget) {
  const scale = c => scaleCost(c, budget);

  if (venueKey === 'universal_studios') {
    const activities = [
      act({ type: 'transport', time: '08:30', name: 'Transfer to Universal Studios Hollywood', detail: 'Book Express Pass in advance — cuts queue times significantly for families', access: 'Fully accessible, complimentary wheelchair rentals at main entrance', costPerPerson: scale(20), address: '100 Universal City Plaza, Universal City, CA 91608', url: 'https://www.universalstudioshollywood.com', mapUrl: 'https://maps.google.com/?q=Universal+Studios+Hollywood', rating: '4.6 ⭐', note: 'Arrive at rope drop (9am). Studio Tour queues are shortest first thing.' }),
      act({ type: 'activity', time: '09:00', name: 'Universal Studios Hollywood — Full Day', detail: 'Wizarding World of Harry Potter, Jurassic World, Studio Tour, Minion Park, Transformers', access: 'Fully accessible — all major rides have accessibility entry, mobility aids available', costPerPerson: scale(109), address: '100 Universal City Plaza, Universal City, CA 91608', url: 'https://www.universalstudioshollywood.com', mapUrl: 'https://maps.google.com/?q=Universal+Studios+Hollywood', rating: '4.6 ⭐', note: 'Kids tip: Do Minion Park first before it fills up. Harry Potter area is magical!' }),
    ];
    if (hasLunch) activities.push(act({ type: 'food', time: '12:30', name: 'Lunch at Three Broomsticks', detail: 'Harry Potter themed dining — Butterbeer, Great Feast platters, pumpkin juice', access: 'Accessible dining with large group tables', costPerPerson: scale(28), address: '100 Universal City Plaza, Universal City, CA 91608', url: 'https://www.universalstudioshollywood.com/web/en/us/plan-your-visit/dine', mapUrl: 'https://maps.google.com/?q=Universal+Studios+Hollywood', rating: '4.2 ⭐', note: 'Non-alcoholic Butterbeer is a must — kids absolutely love it!' }));
    activities.push(
      act({ type: 'activity', time: '14:30', name: 'Afternoon rides + CityWalk', detail: 'Continue rides and shows, then explore Universal CityWalk for shopping and entertainment', access: 'CityWalk is fully accessible — flat, wide paths', costPerPerson: 0, address: 'Universal CityWalk Hollywood, Universal City, CA 91608', url: 'https://www.universalstudioshollywood.com/web/en/us/universal-citywalk', mapUrl: 'https://maps.google.com/?q=Universal+CityWalk+Hollywood', note: 'Pick up merchandise at front shops — better selection than inside the park.' }),
      act({ type: 'food', time: '19:00', name: 'Dinner at Universal CityWalk', detail: 'Buca di Beppo, Bubba Gump Shrimp, Karl Strauss Brewing, or Vivo Italian Kitchen', access: 'All CityWalk restaurants are fully accessible', costPerPerson: scale(38), address: 'Universal CityWalk Hollywood, Universal City, CA 91608', url: 'https://www.universalstudioshollywood.com/web/en/us/universal-citywalk/dine', mapUrl: 'https://maps.google.com/?q=Universal+CityWalk+Hollywood', rating: '3.9 ⭐', note: 'Great way to end a theme park day — no extra travel needed.' }),
    );
    return activities;
  }

  if (venueKey === 'santa_monica') {
    return [
      act({ type: 'transport', time: '09:00', name: 'Drive to Santa Monica', detail: 'Allow extra time for morning traffic — parking on 2nd St or Ocean Ave', access: 'Accessible parking near the pier', costPerPerson: scale(10), address: 'Santa Monica, CA 90401', mapUrl: 'https://maps.google.com/?q=Santa+Monica+Pier', note: 'Go early — Santa Monica fills up by midday, especially on weekends.' }),
      act({ type: 'activity', time: '09:30', name: 'Santa Monica Pier', detail: 'Pacific Park rides, trapeze school, historic carousel, and stunning ocean views', access: 'Pier is fully accessible, Pacific Park rides have accessibility options', costPerPerson: scale(25), address: '200 Santa Monica Pier, Santa Monica, CA 90401', url: 'https://www.santamonicapier.org', mapUrl: 'https://maps.google.com/?q=Santa+Monica+Pier', rating: '4.4 ⭐', note: 'Kids love the Ferris wheel — great photo spot with the pier in the background.' }),
      act({ type: 'food', time: '12:30', name: hasLunch ? 'Lunch — The Lobster' : 'Lunch near the pier', detail: hasLunch ? 'The Lobster (seafood with Pacific views) — book ahead for groups' : 'Bubba Gump, or grab casual bites along the pier', access: 'Accessible dining on Ocean Ave', costPerPerson: scale(hasLunch ? 35 : 22), address: '1602 Ocean Ave, Santa Monica, CA 90401', url: 'https://thelobsterrestaurant.com', mapUrl: 'https://maps.google.com/?q=The+Lobster+Santa+Monica', rating: '4.3 ⭐', note: 'Sit outside for unbeatable Pacific Ocean views with your meal.' }),
      act({ type: 'activity', time: '14:30', name: 'Venice Beach Boardwalk', detail: 'Muscle Beach, street performers, skate park, and miles of beachfront path', access: 'Flat, paved boardwalk — wheelchair and stroller friendly throughout', costPerPerson: 0, address: 'Ocean Front Walk, Venice, CA 90291', mapUrl: 'https://maps.google.com/?q=Venice+Beach+Boardwalk', rating: '4.3 ⭐', note: 'One of the most famous skate parks in the world. Great people-watching!' }),
      act({ type: 'food', time: '19:00', name: 'Dinner — Third Street Promenade', detail: '3 blocks of outdoor dining, shopping and street performers in Santa Monica', access: 'Fully accessible pedestrian street', costPerPerson: scale(32), address: '3rd Street Promenade, Santa Monica, CA 90401', mapUrl: 'https://maps.google.com/?q=Third+Street+Promenade+Santa+Monica', rating: '4.2 ⭐', note: 'Great end to a beach day — pick your cuisine, there is something for everyone.' }),
    ];
  }

  if (venueKey === 'griffith') {
    return [
      act({ type: 'transport', time: '09:00', name: 'Drive to Griffith Observatory', detail: 'Parking limited — arrive early or use the DASH Observatory bus from Los Feliz', access: 'Observatory accessible; some trails to it are steep', costPerPerson: scale(10), address: '2800 E Observatory Rd, Los Angeles, CA 90027', url: 'https://griffithobservatory.org', mapUrl: 'https://maps.google.com/?q=Griffith+Observatory', rating: '4.7 ⭐', note: 'Free entry to the observatory building. Parking fills fast — aim for 9am.' }),
      act({ type: 'activity', time: '09:30', name: 'Griffith Observatory', detail: 'Planetarium shows, Tesla coil, rooftop telescopes, and iconic LA skyline views', access: 'Accessible via elevator inside; outdoor terraces accessible', costPerPerson: scaleCost(7, budget), address: '2800 E Observatory Rd, Los Angeles, CA 90027', url: 'https://griffithobservatory.org', mapUrl: 'https://maps.google.com/?q=Griffith+Observatory', rating: '4.7 ⭐', note: 'Planetarium show is $10 extra but worth it — book ahead for busy weekends.' }),
      act({ type: 'activity', time: '11:30', name: 'Griffith Park Trail Walk', detail: 'Gentle trail through the park with Hollywood Sign and city views', access: 'Western Heritage Trail is moderate — some uneven paths', costPerPerson: 0, address: 'Griffith Park, Los Angeles, CA 90027', mapUrl: 'https://maps.google.com/?q=Griffith+Park' }),
      act({ type: 'food', time: '13:30', name: hasLunch ? 'Lunch — Los Feliz neighbourhood' : 'Lunch break', detail: 'Vermont Avenue has great cafés — casual, local vibe', access: 'Accessible options throughout Los Feliz', costPerPerson: scale(18), address: 'Los Feliz, Los Angeles, CA 90027', mapUrl: 'https://maps.google.com/?q=Los+Feliz+Los+Angeles' }),
      act({ type: 'activity', time: '15:00', name: 'Afternoon at The Grove', detail: 'Upscale outdoor mall with farmers market, fountain shows, and good shopping', access: 'Fully accessible outdoor mall', costPerPerson: 0, address: '189 The Grove Dr, Los Angeles, CA 90036', url: 'https://thegrovela.com', mapUrl: 'https://maps.google.com/?q=The+Grove+LA', rating: '4.4 ⭐' }),
      act({ type: 'food', time: '19:00', name: "Dinner — Republique", detail: "Republique on La Brea is one of LA's best — book well ahead for groups", access: 'Accessible entrance and dining room', costPerPerson: scale(45), address: '624 S La Brea Ave, Los Angeles, CA 90036', url: 'https://republiquela.com', mapUrl: 'https://maps.google.com/?q=Republique+Los+Angeles', rating: '4.6 ⭐', note: 'Reservation essential. Excellent brunch too if you prefer a daytime slot.' }),
    ];
  }

  return []; // Unknown venue — caller keeps original day
}

// ─── Notes parser (applies venue/day overrides to existing plan) ──────────────

// ─── Hotel cost helper ────────────────────────────────────────────────────────

function hotelCostPerPerson(roomRatePerNight, trip) {
  const memberCount = (trip.families || []).flatMap(f => f.members || []).length || 2;
  // Assume 1 room per 2 adults, minimum 1
  const rooms = Math.max(1, Math.ceil(memberCount / 2));
  return Math.ceil((roomRatePerNight * rooms) / memberCount);
}

function extractHotelBudget(lower) {
  // Match: "hotel under $200", "max $150 per room", "room rate below $180", "hotels below $200/night"
  const m = lower.match(/(?:hotel|room|per\s+room|room\s+rate)[^$]*\$\s*(\d+)|(?:under|below|max(?:imum)?|budget[^$]*)\s*\$\s*(\d+)\s*(?:per\s+room|\/room|\/night|per\s+night)?/);
  if (m) return parseInt(m[1] || m[2]);
  // Also match: "$200 per room", "$150/night"
  const m2 = lower.match(/\$\s*(\d+)\s*(?:per\s+room|\/room|per\s+night|\/night)/);
  if (m2) return parseInt(m2[1]);
  return null;
}

function applyHotelBudgetCap(dayActivities, maxRoomRate, trip) {
  const capped = hotelCostPerPerson(maxRoomRate, trip);
  return dayActivities.map(dayActs =>
    (dayActs || []).map(a => {
      if (a.type !== 'stay' || a.costPerPerson === 0) return a;
      return {
        ...a,
        costPerPerson: Math.min(a.costPerPerson, capped),
        note: `Room rate: max $${maxRoomRate}/night per room${a.note ? ' · ' + a.note : ''}`,
      };
    })
  );
}

// ─── Notes parser ─────────────────────────────────────────────────────────────

function applyNoteOverrides(dayActivities, notes, trip, budget, options = {}) {
  if (!notes?.trim()) return dayActivities;

  const lower   = notes.toLowerCase();
  let result    = dayActivities.map(d => [...(d || [])]);
  const profile = profileGroup(trip, []);

  // ── Multi-city detection (highest priority — rewrites the full plan) ────
  const legs = parseMultiLeg(lower, result.length);
  if (legs && legs.length >= 2) {
    const n = result.length;
    let dayIdx = 0;

    legs.forEach((leg, legNum) => {
      const fromCity = legNum > 0 ? legs[legNum - 1].city : null;
      const isFirst  = legNum === 0;
      const isLast   = legNum === legs.length - 1;

      // Transit day before this leg (except first)
      if (fromCity && dayIdx < n) {
        result[dayIdx] = buildTransitDay(fromCity, leg.city, budget, trip, leg.mode);
        dayIdx++;
      }

      // Content days for this leg
      for (let d = 0; d < leg.days && dayIdx < n; d++, dayIdx++) {
        const isArrival   = d === 0 && !isFirst; // already handled arrival via transit day
        const isDeparture = d === leg.days - 1 && isLast;
        result[dayIdx] = buildCityDay(
          leg.city, d, profile, budget,
          isFirst && d === 0,   // first city arrival
          isDeparture,
          trip,
        );
      }
    });

    // Any remaining days (rounding) → last leg's city
    const lastLeg = legs[legs.length - 1];
    while (dayIdx < n) {
      result[dayIdx] = buildCityDay(lastLeg.city, dayIdx, profile, budget, false, dayIdx === n - 1, trip);
      dayIdx++;
    }

    // Apply hotel budget cap if also specified
    const maxRoomRate = extractHotelBudget(lower);
    if (maxRoomRate) result = applyHotelBudgetCap(result, maxRoomRate, trip);

    return result;
  }

  // ── Hotel budget cap (applies across all days) ──────────────────────────
  const maxRoomRate = extractHotelBudget(lower);
  if (maxRoomRate) {
    result = applyHotelBudgetCap(result, maxRoomRate, trip);
  }

  // ── Venue day overrides (day-specific) ──────────────────────────────────
  const dayRefs  = [...lower.matchAll(/\bday\s*(\d+)\b/g)].map(m => parseInt(m[1]) - 1);
  const hasLunch = /lunch|eat there|have lunch|lunch there/.test(lower);

  dayRefs.forEach(dayIdx => {
    if (dayIdx < 0 || dayIdx >= result.length) return;
    let venueDay = [];

    if (/universal studios|universal/.test(lower)) {
      venueDay = buildVenueDayPlan('universal_studios', hasLunch, budget);
    } else if (/santa monica/.test(lower) || (/beach/.test(lower) && !/venice/.test(lower))) {
      venueDay = buildVenueDayPlan('santa_monica', hasLunch, budget);
    } else if (/griffith|observatory/.test(lower)) {
      venueDay = buildVenueDayPlan('griffith', hasLunch, budget);
    } else if (/venice beach|venice/.test(lower)) {
      venueDay = buildVenueDayPlan('santa_monica', hasLunch, budget);
    }

    if (venueDay.length > 0) result[dayIdx] = venueDay;
  });

  return result;
}

// ─── Generic smart plan (unknown destinations) ────────────────────────────────

function buildGenericPlan(trip, travelers, options = {}) {
  const dest    = (trip.destination || 'your destination').split(',')[0].trim();
  const profile = profileGroup(trip, travelers);
  const n       = trip.days.length;
  const budget  = options.budget || 'mid-range';
  const pace    = options.pace   || 'moderate';
  const notes   = (options.notes || '').toLowerCase();
  const scale   = c => scaleCost(c, budget);

  // Per-room hotel rate by budget tier (HOTEL_RATE is module-level)
  const baseRoomRate = HOTEL_RATE[budget] || 160;
  const hotelCost    = hotelCostPerPerson(baseRoomRate, trip);
  const hotelNote    = `Room rate: ~$${baseRoomRate}/night per room · Includes family-friendly amenities`;

  // Multi-hotel: change hotel at midpoint for trips 5+ days (unless user asked for same hotel)
  const sameHotel = /same hotel|one hotel|don't change|dont change/.test(notes);
  const changeDay  = (!sameHotel && n >= 5) ? Math.floor(n / 2) : -1;

  return trip.days.map((day, i) => {
    const isFirst    = i === 0;
    const isLast     = i === n - 1;
    const isHotelChange = i === changeDay;

    if (isFirst) return [
      act({ type: 'transport', time: '10:00', name: `Arrival — ${dest}`, detail: 'Private taxi or shuttle from airport', access: 'Accessible vehicle on request', costPerPerson: scale(25), note: 'Confirm accessible vehicle when booking if needed.' }),
      act({ type: 'stay',      time: '13:00', name: `Hotel check-in — ${dest}`, detail: 'Drop bags, freshen up, explore the neighbourhood', access: 'Accessible rooms on request', costPerPerson: hotelCost, note: hotelNote }),
      act({ type: 'food',      time: '14:00', name: 'Welcome lunch', detail: profile.vegetarianCount > 0 ? 'Café with strong vegetarian options' : 'Local cuisine — first taste of the destination', access: 'Accessible entrance', costPerPerson: scale(20) }),
      act({ type: 'activity',  time: '16:30', name: `Explore ${dest}`, detail: 'Orientation walk — get your bearings and snap first photos', access: 'Mostly flat walking routes available', costPerPerson: 0 }),
      act({ type: 'food',      time: '19:30', name: 'Welcome dinner', detail: profile.hasKids ? 'Family-friendly restaurant, kids menu available' : 'Local restaurant with evening ambience', access: 'Accessible, advance booking for groups', costPerPerson: scale(profile.hasKids ? 28 : 38) }),
    ];

    if (isLast) return [
      act({ type: 'food',      time: '08:00', name: 'Breakfast', detail: 'Hotel buffet or nearby café', access: 'Accessible', costPerPerson: scale(14) }),
      act({ type: 'activity',  time: '09:30', name: 'Morning market visit', detail: 'Last-minute souvenirs and local goods', access: 'Mostly accessible, some uneven ground', costPerPerson: scale(10) }),
      act({ type: 'food',      time: '12:00', name: 'Farewell lunch', detail: `Last meal in ${dest} — pick a favourite from the trip`, access: 'Accessible entrance', costPerPerson: scale(22) }),
      act({ type: 'stay',      time: '13:30', name: 'Hotel checkout', detail: 'Check out and store luggage if needed', access: 'Accessible lobby', costPerPerson: 0 }),
      act({ type: 'transport', time: '15:30', name: 'Departure transfer', detail: 'Pre-booked taxi or shuttle to airport', access: 'Accessible vehicle on request', costPerPerson: scale(25) }),
    ];

    // Middle days — 3 rotating themes
    const allThemes = [
      [
        act({ type: 'food',     time: '08:00', name: 'Breakfast', detail: 'Hotel or local café', access: 'Accessible', costPerPerson: scale(12) }),
        act({ type: 'activity', time: '09:30', name: `${dest} highlights tour`, detail: 'Guided tour of top local landmarks', access: profile.hasWheelchair ? 'Fully accessible route confirmed' : 'Moderate walking, ~2–3 km', costPerPerson: scale(profile.hasKids ? 18 : 25) }),
        act({ type: 'food',     time: '13:00', name: 'Lunch', detail: profile.vegetarianCount > 0 ? 'Café with vegetarian and vegan options' : 'Local restaurant', access: 'Accessible', costPerPerson: scale(18) }),
        act({ type: 'activity', time: '15:00', name: 'Local museum or gallery', detail: "Explore history, art or culture — check what's showing", access: 'Wheelchair accessible, audio guides available', costPerPerson: scale(12) }),
        act({ type: 'food',     time: '19:30', name: 'Dinner', detail: 'Recommended local restaurant — book ahead for groups', access: 'Accessible, advance booking', costPerPerson: scale(32) }),
      ],
      [
        act({ type: 'food',     time: '07:30', name: 'Early breakfast', detail: 'Fuel up — outdoor day ahead', access: 'Accessible', costPerPerson: scale(12) }),
        act({ type: 'activity', time: '09:00', name: 'Nature & outdoor excursion', detail: profile.hasKids ? 'Family-friendly outdoor adventure' : 'Guided nature tour or hike', access: profile.hasWheelchair ? 'Accessible paths — confirm with guide' : 'Moderate terrain', costPerPerson: scale(profile.hasKids ? 35 : 55) }),
        act({ type: 'food',     time: '13:30', name: 'Scenic lunch', detail: 'Al fresco dining with views', access: 'Ground-level outdoor seating', costPerPerson: scale(20) }),
        act({ type: 'activity', time: '16:00', name: 'Afternoon at leisure', detail: 'Beach, park, or pool — decompress and relax', access: 'Accessible leisure facilities', costPerPerson: 0 }),
        act({ type: 'food',     time: '19:30', name: 'Dinner', detail: profile.hasKids ? 'Family dinner, early seating available' : 'Relaxed evening dinner', access: 'Accessible', costPerPerson: scale(30) }),
      ],
      [
        act({ type: 'food',     time: '08:30', name: 'Breakfast', detail: 'Local café or hotel', access: 'Accessible', costPerPerson: scale(14) }),
        act({ type: 'activity', time: '10:00', name: 'Local market morning', detail: 'Street food, crafts and local goods', access: 'Mostly flat, some uneven surfaces', costPerPerson: scale(15) }),
        act({ type: 'food',     time: '13:00', name: 'Lunch', detail: 'Street food or casual café', access: 'Accessible options nearby', costPerPerson: scale(15) }),
        act({ type: 'activity', time: '15:00', name: profile.hasKids ? 'Kids activity / park' : 'Neighbourhood exploration', detail: profile.hasKids ? 'Playground or family entertainment' : 'Walk local streets, find hidden gems', access: 'Accessible', costPerPerson: scale(profile.hasKids ? 20 : 0) }),
        act({ type: 'food',     time: '19:30', name: 'Group dinner', detail: 'Larger restaurant suited to the whole group — advance booking', access: 'Accessible, booking recommended', costPerPerson: scale(35) }),
      ],
    ];

    // Hotel change day — insert checkout + new check-in around the theme activities
    if (isHotelChange) {
      return [
        act({ type: 'food',  time: '08:00', name: 'Breakfast', detail: 'Hotel breakfast before checkout', access: 'Accessible', costPerPerson: scale(12) }),
        act({ type: 'stay',  time: '10:00', name: 'Hotel checkout', detail: 'Check out and store luggage — hotel will hold bags until your new hotel is ready', access: 'Accessible lobby, luggage assistance available', costPerPerson: 0, note: 'Ask hotel to hold luggage so you can sightsee before heading to the next hotel.' }),
        act({ type: 'activity', time: '11:00', name: `Explore new area of ${dest}`, detail: 'Discover a different neighbourhood before checking into your next hotel', access: profile.hasWheelchair ? 'Accessible route' : 'Moderate walking', costPerPerson: 0 }),
        act({ type: 'food',  time: '13:00', name: 'Lunch', detail: 'Try a restaurant in the new neighbourhood', access: 'Accessible', costPerPerson: scale(18) }),
        act({ type: 'stay',  time: '15:00', name: `Check in — new hotel`, detail: `New hotel for the second half of the trip — different area, fresh perspective`, access: 'Accessible rooms on request', costPerPerson: hotelCost, note: hotelNote }),
        act({ type: 'food',  time: '19:30', name: 'Dinner', detail: 'Dinner near the new hotel', access: 'Accessible', costPerPerson: scale(30) }),
      ];
    }

    let dayPlan = [...allThemes[(i - 1) % allThemes.length]];
    if (pace === 'relaxed') dayPlan = dayPlan.filter((_, j) => j !== 3);
    else if (pace === 'packed') dayPlan = [...dayPlan, act({ type: 'activity', time: '21:00', name: 'Evening entertainment', detail: profile.hasKids ? 'Evening show or kids-friendly activity' : 'Live music, cocktails, or night market', access: 'Check venue accessibility', costPerPerson: scale(20) })];

    return dayPlan;
  });
}

// ─── Public: main planning entry point ───────────────────────────────────────

/**
 * legacyFallback — the existing single-LLM + destination-DB planner.
 * Used when the multi-agent pipeline's ItineraryAgent fails or has no API key.
 * Kept intact so Phase 1 gracefully degrades.
 *
 * @param {Array} currentPlan  Existing plan for refinement requests (optional)
 */
async function legacyFallback(trip, travelers, options, onProgress, refinement, currentPlan) {
  const { notes, budget = 'mid-range' } = options;

  // Try real Claude API (single call) — pass currentPlan so refinement prompt includes it
  const aiResult = await callClaudeAPI(trip, travelers, options, onProgress, currentPlan || null, refinement);
  if (aiResult) return aiResult;

  onProgress?.('Analysing your trip and group…');
  await sleep(350);

  const allNotes = refinement ? `${notes || ''}\n${refinement}`.trim() : notes;

  // For refinements without API key: start from the current plan and apply overrides.
  // This preserves the existing itinerary instead of generating a new one from scratch.
  if (refinement && currentPlan?.length) {
    onProgress?.('Applying your changes…');
    await sleep(300);
    let result = currentPlan.map(d => [...(d || [])]);
    result = applyNoteOverrides(result, allNotes, trip, budget);
    onProgress?.('Done!');
    await sleep(200);
    return result;
  }

  const smart = generateSmartItinerary(trip, travelers);
  let dayActivities;

  if (smart) {
    onProgress?.('Found destination data — building real-place itinerary…');
    await sleep(500);
    if (allNotes?.trim()) { onProgress?.('Applying your instructions…'); await sleep(400); }
    dayActivities = smart.map(d => (d || []).map(a => ({ ...a, id: a.id || uid() })));
    dayActivities = applyNoteOverrides(dayActivities, allNotes, trip, budget);
    onProgress?.('Personalising for your group…'); await sleep(350);
    onProgress?.('Adding cost estimates…');        await sleep(250);
  } else {
    onProgress?.('Building itinerary for ' + (trip.destination || 'your destination') + '…');
    await sleep(500);
    if (allNotes?.trim()) { onProgress?.('Applying your instructions…'); await sleep(350); }
    onProgress?.('Personalising for your group…'); await sleep(400);
    onProgress?.('Adding cost estimates…');        await sleep(350);
    dayActivities = buildGenericPlan(trip, travelers, options);
    dayActivities = applyNoteOverrides(dayActivities, allNotes, trip, budget);
    onProgress?.('Finalising…'); await sleep(250);
  }

  return dayActivities;
}

/**
 * callPlannerAPI(trip, travelers, options, onProgress, currentPlan?, refinement?)
 *
 * options:     { notes, pace, budget, focus }
 * currentPlan: existing plan (for refinement prompts)
 * refinement:  chat-bar refinement text (skips multi-agent pipeline)
 *
 * Returns Array<Array<Activity>>
 *
 * Side effect: attaches budgetResult to the returned array as ._budget
 * so the store can auto-populate Splitwise expenses.
 */
export async function callPlannerAPI(trip, travelers, options = {}, onProgress, currentPlan, refinement, onAgentEvent) {
  // Refinement requests bypass the full pipeline (just update existing plan)
  if (refinement) {
    return legacyFallback(trip, travelers, options, onProgress, refinement, currentPlan);
  }

  // ── Multi-agent pipeline ──────────────────────────────────────────────────
  const { runPipeline } = await import('../agents/pipeline');

  const result = await runPipeline(
    trip,
    travelers,
    options,
    onProgress,
    (t, tv, opts, prog) => legacyFallback(t, tv, opts, prog, null),
    onAgentEvent,
  );

  // Attach full result so store + UI can read it
  if (result.dayActivities) {
    result.dayActivities._budget = {
      budgetByFamily:  result.budgetByFamily,
      expenses:        result.expenses,
      groupProfile:    result.groupProfile,
      stayResults:     result.stayResults,
      topExperiences:  result.topExperiences,
      transitResult:   result.transitResult,
      meta:            result.meta,
    };
  }

  return result.dayActivities;
}

// ─── Public: plan cost/count summary ─────────────────────────────────────────

export function planSummary(dayActivities, trip) {
  let totalCost     = 0;
  let activityCount = 0;

  const dayBreakdowns = (dayActivities || []).map((acts, i) => {
    const activities = acts || [];
    const cost       = activities.reduce((s, a) => s + (a.costPerPerson || 0), 0);
    totalCost        += cost;
    activityCount    += activities.length;
    return {
      label:      trip.days[i]?.label || `Day ${i + 1}`,
      date:       trip.days[i]?.date  || '',
      cost,
      activities,
    };
  });

  return { totalCost, activityCount, dayBreakdowns };
}
