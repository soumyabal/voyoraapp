/**
 * plannerRules.js — Voyara AI Planning Rule Guide
 *
 * Single source of truth for how every itinerary should be built.
 * Used in three ways:
 *   1. System prompt sent to Claude API when a real key is configured
 *   2. Rule reference for the simulation fallback (plannerAPI.js)
 *   3. Prompt builder for chat-based refinement messages
 *
 * Changing rules here affects both real-AI and simulated outputs.
 */

import { uid } from './helpers';
import { APP_NAME } from '../config';

// ─── Timing ───────────────────────────────────────────────────────────────────

export const TIME_SLOTS = {
  earlyBreakfast: '07:30',
  breakfast:      '08:00',
  morning:        '09:30',
  midMorning:     '11:00',
  lunch:          '12:30',
  earlyAfternoon: '14:00',
  afternoon:      '15:30',
  latePm:         '17:00',
  dinner:         '19:00',
  evening:        '20:30',
  lateEvening:    '21:30',
};

// ─── Pace rules ───────────────────────────────────────────────────────────────

export const PACE_RULES = {
  relaxed: {
    maxActivitiesPerDay: 4,
    includeEvening: false,
    earliestStart: '09:00',
    description: 'Max 4 activities. Nothing before 9am. Always include a leisure or rest slot. Keep transitions gentle.',
  },
  moderate: {
    maxActivitiesPerDay: 5,
    includeEvening: false,
    earliestStart: '08:30',
    description: 'Up to 5 activities. One relaxed afternoon slot. Balanced — something every 2–3 hours.',
  },
  packed: {
    maxActivitiesPerDay: 7,
    includeEvening: true,
    earliestStart: '07:30',
    description: 'Up to 7 activities. Include evening entertainment. Early starts allowed. Maximise the day.',
  },
};

// ─── Budget rules ─────────────────────────────────────────────────────────────

export const BUDGET_RULES = {
  budget: {
    dailyCapPerPerson: 70,
    multiplier: 0.65,
    mealRange:  { breakfast: [8, 12], lunch: [12, 18], dinner: [18, 28] },
    description: 'Free or low-cost attractions. Street food and local eateries. Avoid luxury experiences. Maximise free sights.',
  },
  'mid-range': {
    dailyCapPerPerson: 160,
    multiplier: 1.0,
    mealRange:  { breakfast: [12, 18], lunch: [18, 30], dinner: [28, 48] },
    description: 'Mix of paid and free attractions. Casual-to-nice restaurants. One premium experience per 3 days is fine.',
  },
  luxury: {
    dailyCapPerPerson: 380,
    multiplier: 1.6,
    mealRange:  { breakfast: [20, 35], lunch: [35, 65], dinner: [60, 120] },
    description: 'Premium attractions and experiences. Fine dining. Private tours where possible. Comfort over compromise.',
  },
};

// ─── Activity type definitions ────────────────────────────────────────────────

export const ACTIVITY_TYPES = {
  transport: 'Airport transfers, taxis, shuttles, rental car pickup, day-trip drives.',
  stay:      'Hotel check-in/check-out, luggage drop-off, apartment arrival.',
  food:      'All meals — breakfast, brunch, lunch, dinner, food markets, tastings.',
  activity:  'Sightseeing, museums, beaches, parks, theme parks, tours, shopping.',
  note:      'Free-text reminders, packing tips, or general observations — no time slot.',
};

// ─── Human-readable rule strings (used in Claude system prompt) ───────────────

export const DAY_STRUCTURE_RULES = `
MANDATORY DAY STRUCTURE (follow this order every day):
1. BREAKFAST / START — time 07:30–09:00 (skip for relaxed pace if user prefers sleep-in)
2. MORNING ACTIVITY — time 09:00–12:00, duration 2–3 hours
3. LUNCH — time 12:30–14:00 — ALWAYS include every day, no exceptions
4. AFTERNOON — 1 or 2 activities, time 14:00–18:00
5. DINNER — time 18:30–20:30 — ALWAYS include every day, no exceptions
6. EVENING (packed pace only) — time 20:30+, entertainment or nightlife

SPECIAL DAYS:
- Day 1 (arrival): airport/station transfer → hotel check-in → short neighbourhood walk → welcome dinner
- Last day (departure): breakfast → brief morning activity → farewell lunch → hotel checkout → departure transfer

HARD CONSTRAINTS:
- Never schedule before 07:00 or after 23:00
- Minimum 45-minute gap between activities (travel + rest buffer)
- Kids under 12 present → NO nightlife, NO bars, cap evening at 20:30
- Wheelchair user present → ALL activities fully accessible, NO hikes, NO uneven terrain
- Vegetarian travellers → restaurants must have solid veggie/vegan options (note this)
- Elderly travellers (65+) → favour accessible, comfortable venues; avoid extreme heat/cold activities
`;

export const COST_RULES = `
COST GUIDELINES (costPerPerson in USD):
- Free activities: costPerPerson = 0 (beaches, parks, walking, window shopping)
- Transport: $10–$35 per person per leg (city taxi/Uber); $5–$20 (public transit day pass)
- Meals: scale with budget level — budget meals ~$12–20, mid-range ~$20–40, luxury ~$50–100
- Attractions: use real published prices where known; otherwise estimate conservatively
- Hotel stays: costPerPerson = Math.ceil(roomRatePerNight * roomsNeeded / groupSize)
  - Estimate rooms as 1 room per 2 adults (min 1). Kids under 5 share parents' room.
  - Budget hotels: $60–$120/room/night. Mid-range: $120–$220/room/night. Luxury: $250+/room/night.
  - Use the "note" field to show the per-room rate: e.g. "Room rate: ~$150/night per room"
  - If user specifies a max room rate (e.g. "hotel under $200"), ALL hotels must stay below that
- All costs are per-person estimates; group totals are calculated by the app
`;

export const HOTEL_RULES = `
HOTEL & ACCOMMODATION RULES:
- Families do NOT need to stay in a single hotel for the entire trip — changing hotels is fine and often preferred.
- For trips 5+ days: suggest at least 2 different hotels/areas unless the user says otherwise.
- On hotel change days: add BOTH a morning checkout activity AND an afternoon check-in at the new hotel.
  Example:
    { "type": "stay", "time": "10:00", "name": "Hotel checkout — [Current Hotel]", "detail": "Check out, store luggage if needed", "costPerPerson": 0 }
    { "type": "stay", "time": "15:00", "name": "Check in — [New Hotel Name]", "detail": "New hotel, freshen up, explore new neighbourhood", "costPerPerson": <calculated> }
- If user specifies "hotel under $X per room" or "max $X room rate" — ALL stay activities must reflect a room rate at or below $X.
- Suggest hotels by name or area where possible (e.g. "Santa Monica beachfront hotel" rather than just "hotel").
- For family groups: note whether the hotel has family rooms, connecting rooms, or kid-friendly amenities.
- Always include the hotel area/neighbourhood in the address field so families know where they'll be.
`;

export const MULTI_CITY_RULES = `
MULTI-CITY TRIP RULES:
Families often visit more than one city — including return trips to the same city. Support all routing patterns:

ROUTING PATTERNS TO RECOGNISE:
- A → B: "first N days in [City A] then [City B]"
- A → B → A: "arrive [City A], drive to [City B] for N days, drive back to [City A]" (RETURN TRIP)
- A → B → C: "[City A] for N days, then [City B] for M days, then [City C]"
- Mixed: "arrive LA, rent a car and drive to San Diego for 3 days, come back to LA to fly home"

TRANSPORT MODE — detect and use the correct mode:
- User says "drive", "driving", "road trip", "by car", "rent a car" → use drive for ALL or that leg
- User says "fly", "flight", "flying", "by plane" → use fly for ALL or that leg
- User says "take the train", "Amtrak", "rail" → use train for that leg
- If mode unspecified: short routes (SD↔LA) → drive by default; long routes (SFO↔LA) → fly by default

TRANSIT DAY STRUCTURE (one per city change):
- Morning: Breakfast + hotel checkout in origin city
- Late morning: Travel (type: "transport") — name it "[Mode emoji] [Origin] → [Destination]"
  Include real journey time + cost. Add alternative option in the "note" field.
- Afternoon: Arrive + hotel check-in in new city (type: "stay")
- Evening: First dinner in new city

REAL TRANSIT OPTIONS:
- San Diego → Los Angeles: 🚗 Drive I-5 ~2.5 hrs ($15/person) OR 🚂 Pacific Surfliner ~3 hrs ($37/person)
- Los Angeles → San Diego: Same in reverse
- Los Angeles → San Francisco: ✈️ Fly LAX→SFO ~1.5 hrs ($85–$130) OR 🚗 Drive I-5 ~5.5 hrs
- San Francisco → Los Angeles: Same in reverse
- San Diego → San Francisco: ✈️ Fly SAN→SFO ~1.5 hrs ($95–$140)

RETURN TRIPS (A → B → A):
- Day 1 to N: City A activities
- Transition day: checkout A, travel to B, check-in B
- Middle days: City B activities with real B venues
- Return transition day: checkout B, travel back to A, check-in A (or proceed to departure)
- Final days: City A activities again (different venues from the first stay if possible)

HOTEL RULE: Every city change includes a checkout from the old hotel and a check-in at the new hotel. On return to a city, guests may re-use the same hotel or choose a different area.

CITY-SPECIFIC CONTENT: Never mix venues. City A days only use City A restaurants and attractions. City B days only use City B venues.
`;

export const NOTE_PARSING_RULES = `
INSTRUCTIONS PARSING (apply user notes with highest priority):
- "Day N [venue/activity]" → Replace Day N's full plan with a day centred on that venue
- "add [X] to Day N" → Insert activity X into Day N at the appropriate time slot
- "lunch there" / "eat there" / "we will have lunch there" → Include lunch at the same venue
- "remove [X]" / "skip [X]" → Remove or de-prioritise matching activities
- "more [type]" (e.g. "more beach", "more culture") → Bias unspecified days toward that type
- "keep Day N free" / "rest day" → Minimal activities: breakfast, leisure, dinner only
- "early start Day N" → Begin Day N at 07:30 regardless of pace setting
- "no [X]" (e.g. "no museums", "no taxis") → Exclude that category throughout
- Specific restaurant/venue name → Use that exact place for the relevant meal/activity
- Unrecognised venue → Create a generic "Full day at [Venue Name]" with realistic estimated costs
- Conflicting instructions → Latest/most specific instruction wins

MULTI-CITY INSTRUCTIONS:
- "first N days in [City]" / "N nights in [City] then [City2]" → Split, insert transit day
- "start in [City]" / "begin in [City]" → First leg in that city
- "end in [City]" / "fly home from [City]" → Final leg in that city
- "drive to [City]" / "fly to [City]" / "train to [City]" → Use specified mode for that transit leg
- "we will drive" / "road trip" / "renting a car" → All transit legs use drive mode
- "we will fly" / "flying between cities" → All transit legs use fly mode
- "drive back" / "fly back" / "come back to [City]" / "return to [City]" → Insert return transit + return city days
- "back in [City] for N days" → After returning, spend N days in that city before departure
- If multiple cities detected, ALWAYS include one transit day per city change with real options

HOTEL-SPECIFIC INSTRUCTIONS:
- "hotel under $X" / "max $X per room" / "room rate below $X" / "hotels below $X" →
    All stay activities must use a room rate ≤ $X. Recalculate costPerPerson accordingly.
    Add note: "Room rate: max $X/night per room"
- "change hotel" / "different hotel" / "move hotel" / "multiple hotels" →
    Include at least one hotel change mid-trip with checkout + new check-in activities
- "hotel near [area]" / "stay in [neighbourhood]" →
    Set hotel to that area; update address field accordingly
- "same hotel throughout" / "one hotel" / "don't change hotel" →
    Use a single hotel for the whole trip; remove any mid-trip checkout/check-in pairs
- "upgrade hotel" / "nicer hotel" →
    Use upper end of the budget tier's room rate range
`;

// ─── Build the system prompt sent to Claude API ───────────────────────────────

export function buildSystemPrompt() {
  const typeList = Object.entries(ACTIVITY_TYPES)
    .map(([k, v]) => `  "${k}": ${v}`)
    .join('\n');

  return `You are ${APP_NAME}'s AI travel planner. You create detailed, family-aware, day-by-day itineraries.

${DAY_STRUCTURE_RULES}

ACTIVITY TYPES — use EXACTLY one of these string values for the "type" field:
${typeList}

${COST_RULES}

${HOTEL_RULES}

${MULTI_CITY_RULES}

${NOTE_PARSING_RULES}

OUTPUT FORMAT — return ONLY a valid JSON array. No markdown, no code fences, no explanation:
[
  [
    {
      "type": "transport|stay|food|activity|note",
      "time": "HH:MM",
      "name": "Short descriptive name (max 60 characters)",
      "detail": "1–2 sentence description with a practical tip or what to expect",
      "access": "Accessibility note — e.g. 'Fully wheelchair accessible' or 'Some steep stairs'",
      "costPerPerson": 0,
      "address": "Full street address, or area/neighbourhood name if exact address unknown",
      "url": "Official website URL, or empty string if unknown",
      "mapUrl": "https://maps.google.com/?q=URL-encoded+place+name",
      "rating": "e.g. '4.5 ⭐' from Google/TripAdvisor, or null if unknown",
      "note": "One-sentence AI tip specifically for this group (kids, accessibility, food, etc.), or null"
    }
  ],
  [ /* Day 2 activities */ ],
  [ /* Day 3 ... */ ]
]

Return EXACTLY as many sub-arrays as there are trip days. Every day must have lunch and dinner.`;
}

// ─── Build the user-turn prompt for a plan request ────────────────────────────

export function buildPlanPrompt(trip, travelers = [], options = {}) {
  const { notes, pace = 'moderate', budget = 'mid-range', focus = [] } = options;

  // Group profile
  const allMembers = (trip.families || []).flatMap(f => f.members || []);
  const kids       = allMembers.filter(m => m.age < 13);
  const teens      = allMembers.filter(m => m.age >= 13 && m.age < 18);
  const elders     = allMembers.filter(m => m.age >= 65);
  const wheelchair = allMembers.filter(m => (m.needs || []).some(n => /wheelchair|mobility/i.test(n)));
  const veggies    = allMembers.filter(m => (m.needs || []).some(n => /veg/i.test(n)));
  const interests  = [...new Set(allMembers.flatMap(m => m.interests || []))];

  const groupParts = [
    `${allMembers.length} traveller${allMembers.length !== 1 ? 's' : ''} total`,
    kids.length     > 0 ? `${kids.length} child${kids.length > 1 ? 'ren' : ''} (ages ${kids.map(k => k.age).join(', ')})` : null,
    teens.length    > 0 ? `${teens.length} teen${teens.length > 1 ? 's' : ''}` : null,
    elders.length   > 0 ? `${elders.length} elderly traveller${elders.length > 1 ? 's' : ''} — favour comfortable, accessible options` : null,
    wheelchair.length > 0 ? `wheelchair user present — ALL venues must be fully accessible` : null,
    veggies.length  > 0 ? `${veggies.length} vegetarian${veggies.length > 1 ? 's' : ''} — restaurants must have veggie/vegan options` : null,
    interests.length > 0 ? `group interests: ${interests.join(', ')}` : null,
    (trip.families || []).length > 1 ? `${trip.families.length} family groups travelling together` : null,
  ].filter(Boolean);

  const paceRule   = PACE_RULES[pace]   || PACE_RULES.moderate;
  const budgetRule = BUDGET_RULES[budget] || BUDGET_RULES['mid-range'];

  const lines = [
    `TRIP: ${trip.name || 'Family Trip'}`,
    `DESTINATION: ${trip.destination}`,
    `DATES: ${trip.startDate} → ${trip.endDate} (${trip.days?.length || 0} days)`,
    `GROUP: ${groupParts.join(' · ')}`,
    `PACE: ${pace} — ${paceRule.description}`,
    `BUDGET: ${budget} — ${budgetRule.description}`,
    focus.length > 0 ? `FOCUS: ${focus.join(', ')} — weight activities toward these themes` : null,
  ].filter(Boolean);

  if (notes && notes.trim()) {
    lines.push('', `USER INSTRUCTIONS (follow exactly — highest priority):`);
    lines.push(notes.trim());
  }

  lines.push('', `Generate a complete ${trip.days?.length || 0}-day itinerary. Return JSON only.`);
  return lines.join('\n');
}

// ─── Build a refinement prompt (chat-style update to existing plan) ───────────

export function buildRefinementPrompt(trip, travelers, options, currentPlan, refinement) {
  const base = buildPlanPrompt(trip, travelers, options);

  // Summarise the current plan so Claude knows what exists
  const planSummary = (currentPlan || []).map((dayActs, i) => {
    const names = (dayActs || []).map(a => `${a.time} ${a.name}`).join('; ');
    return `  Day ${i + 1}: ${names || 'empty'}`;
  }).join('\n');

  return [
    base,
    '',
    'CURRENT PLAN SUMMARY (what is already scheduled):',
    planSummary,
    '',
    'USER REFINEMENT REQUEST (apply this change and return the complete updated plan):',
    refinement.trim(),
    '',
    'Return the complete updated plan as JSON — all days, even unchanged ones.',
  ].join('\n');
}

// ─── Parse Claude API JSON response → Activity[][] ────────────────────────────

export function parsePlanResponse(rawText, tripDayCount) {
  if (!rawText) return null;

  try {
    // Strip markdown fences if present
    const cleaned = rawText
      .replace(/```(?:json)?\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) return null;

    const result = [];
    for (let i = 0; i < tripDayCount; i++) {
      const dayArr = parsed[i];
      if (!Array.isArray(dayArr)) {
        result.push([]);
        continue;
      }

      result.push(
        dayArr
          .filter(a => a && typeof a === 'object' && a.name)
          .map(a => ({
            id:            uid(),
            type:          validateType(a.type),
            time:          String(a.time || '10:00').slice(0, 5),
            name:          String(a.name || '').slice(0, 80),
            detail:        String(a.detail || ''),
            access:        String(a.access || ''),
            costPerPerson: Math.max(0, Number(a.costPerPerson) || 0),
            address:       String(a.address || ''),
            url:           String(a.url || ''),
            mapUrl:        buildMapUrl(a),
            rating:        a.rating ? String(a.rating) : null,
            note:          a.note   ? String(a.note)   : null,
            lat:           a.lat    || null,
            lng:           a.lng    || null,
          }))
      );
    }

    return result;
  } catch {
    return null; // Caller falls back to simulation
  }
}

function validateType(raw) {
  const valid = ['transport', 'stay', 'food', 'activity', 'note'];
  return valid.includes(raw) ? raw : 'activity';
}

function buildMapUrl(a) {
  if (a.mapUrl && a.mapUrl.startsWith('http')) return a.mapUrl;
  if (a.address) return `https://maps.google.com/?q=${encodeURIComponent(a.address)}`;
  if (a.name)    return `https://maps.google.com/?q=${encodeURIComponent(a.name)}`;
  return '';
}
