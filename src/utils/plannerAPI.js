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
import { generateSmartItinerary, profileGroup }          from './itineraryPlanner';
import { buildSystemPrompt, buildPlanPrompt, buildRefinementPrompt, parsePlanResponse } from './plannerRules';
import { uid } from './helpers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const BUDGET_MULT = { budget: 0.65, 'mid-range': 1.0, luxury: 1.6 };
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
        max_tokens: 4096,
        system:     buildSystemPrompt(),
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.warn('[plannerAPI] Claude API error', res.status);
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

function applyNoteOverrides(dayActivities, notes, trip, budget) {
  if (!notes?.trim()) return dayActivities;

  const lower  = notes.toLowerCase();
  const result = dayActivities.map(d => [...(d || [])]);

  const dayRefs = [...lower.matchAll(/\bday\s*(\d+)\b/g)].map(m => parseInt(m[1]) - 1);
  if (dayRefs.length === 0) return result;

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
  const scale   = c => scaleCost(c, budget);

  return trip.days.map((day, i) => {
    const isFirst = i === 0;
    const isLast  = i === n - 1;

    if (isFirst) return [
      act({ type: 'transport', time: '10:00', name: `Arrival — ${dest}`, detail: 'Private taxi or shuttle from airport', access: 'Accessible vehicle on request', costPerPerson: scale(25), note: 'Confirm accessible vehicle when booking if needed.' }),
      act({ type: 'stay',      time: '13:00', name: 'Hotel check-in', detail: 'Drop bags, freshen up, explore the neighbourhood', access: 'Accessible rooms on request', costPerPerson: 0 }),
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

    let dayPlan = [...allThemes[(i - 1) % allThemes.length]];
    if (pace === 'relaxed') dayPlan = dayPlan.filter((_, j) => j !== 3);
    else if (pace === 'packed') dayPlan = [...dayPlan, act({ type: 'activity', time: '21:00', name: 'Evening entertainment', detail: profile.hasKids ? 'Evening show or kids-friendly activity' : 'Live music, cocktails, or night market', access: 'Check venue accessibility', costPerPerson: scale(20) })];

    return dayPlan;
  });
}

// ─── Public: main planning entry point ───────────────────────────────────────

/**
 * callPlannerAPI(trip, travelers, options, onProgress, currentPlan?, refinement?)
 *
 * options:     { notes, pace, budget, focus }
 * currentPlan: existing Array<Array<Activity>> — used for refinement prompts
 * refinement:  plain-text refinement request (chat message from user)
 *
 * Returns Array<Array<Activity>>
 */
export async function callPlannerAPI(trip, travelers, options = {}, onProgress, currentPlan, refinement) {
  const { notes, budget = 'mid-range' } = options;

  // ── 1. Try real Claude API ────────────────────────────────────────────────
  const aiResult = await callClaudeAPI(trip, travelers, options, onProgress, currentPlan, refinement);
  if (aiResult) return aiResult;

  // ── Simulation paths (no API key, or API failed) ─────────────────────────

  onProgress?.('Analysing your trip and group…');
  await sleep(350);

  // ── 2. Known-destination database ────────────────────────────────────────
  const smart = generateSmartItinerary(trip, travelers);
  let dayActivities;

  if (smart) {
    onProgress?.('Found destination data — building real-place itinerary…');
    await sleep(500);

    const allNotes = refinement ? `${notes || ''}\n${refinement}`.trim() : notes;
    if (allNotes?.trim()) {
      onProgress?.('Applying your instructions…');
      await sleep(400);
    }

    dayActivities = smart.map(d => (d || []).map(a => ({ ...a, id: a.id || uid() })));
    dayActivities = applyNoteOverrides(dayActivities, allNotes, trip, budget);

    onProgress?.('Personalising for your group…');
    await sleep(350);
    onProgress?.('Adding cost estimates…');
    await sleep(250);

  } else {
    // ── 3. Generic fallback for unknown destinations ───────────────────────
    onProgress?.('Building itinerary for ' + (trip.destination || 'your destination') + '…');
    await sleep(500);

    const allNotes = refinement ? `${notes || ''}\n${refinement}`.trim() : notes;
    if (allNotes?.trim()) {
      onProgress?.('Applying your instructions…');
      await sleep(350);
    }

    onProgress?.('Personalising for your group…');
    await sleep(400);
    onProgress?.('Adding cost estimates…');
    await sleep(350);

    dayActivities = buildGenericPlan(trip, travelers, options);
    dayActivities = applyNoteOverrides(dayActivities, allNotes, trip, budget);

    onProgress?.('Finalising…');
    await sleep(250);
  }

  return dayActivities;
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
