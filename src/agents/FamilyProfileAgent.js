/**
 * FamilyProfileAgent.js
 *
 * SEQUENTIAL · no API call
 *
 * Builds a GroupProfile from all trip families + global travelers.
 * This drives every downstream agent's filtering:
 *   - StayAgent   → family rooms, accessible, cot availability
 *   - ExperienceAgent → age-filtered, interest-scored activities
 *   - TransitAgent  → group size, accessible vehicles
 *   - FamilyBudgetAgent → room counts, per-family member counts
 *   - ItineraryAgent   → group-profile-aware prompt context
 */

import { effectiveMember } from '../utils/helpers';

/**
 * run(trip, travelers) → GroupProfile
 *
 * GroupProfile shape:
 * {
 *   // Demographics
 *   totalMembers:   number,
 *   totalFamilies:  number,
 *   families:       [{ id, name, color, members[], memberCount, roomsNeeded }]
 *   members:        enrichedMember[]   // with travelerId defaults merged in
 *
 *   // Age groups
 *   hasInfants:     boolean   // age < 2
 *   hasKids:        boolean   // age 2–12
 *   hasTeens:       boolean   // age 13–17
 *   hasElders:      boolean   // age 65+
 *   infantCount:    number
 *   kidCount:       number
 *   teenCount:      number
 *   elderCount:     number
 *   adultCount:     number
 *
 *   // Accessibility
 *   hasWheelchair:  boolean
 *   hasStroller:    boolean   // infants or explicit stroller need
 *   wheelchairCount: number
 *
 *   // Dietary
 *   dietaryNeeds:   string[]  // unique list e.g. ['Vegetarian', 'Gluten-free']
 *   vegetarianCount: number
 *
 *   // Interests (merged from all members, deduplicated)
 *   interests:      string[]
 *
 *   // Trip preferences
 *   pace:           'relaxed' | 'moderate' | 'packed'
 *   budget:         'budget' | 'mid-range' | 'luxury'
 *
 *   // Accommodation
 *   totalRoomsNeeded: number  // 1 room per 2 adults, +1 per family with kids
 *   roomType:         string  // 'family' | 'standard' | 'accessible'
 *
 *   // Summary flags for prompt building
 *   flags:          string[]  // human-readable list for LLM context
 * }
 */
export function run(trip, travelers = []) {
  const families = trip.families || [];

  // Enrich every member with global traveler defaults (travelerId merge)
  const enrichedFamilies = families.map(f => ({
    ...f,
    members: f.members.map(m => effectiveMember(m, travelers)),
  }));

  const allMembers = enrichedFamilies.flatMap(f => f.members);

  // ── Age groups ────────────────────────────────────────────────────────────
  const infants  = allMembers.filter(m => (m.age || 0) < 2);
  const kids     = allMembers.filter(m => (m.age || 0) >= 2  && (m.age || 0) < 13);
  const teens    = allMembers.filter(m => (m.age || 0) >= 13 && (m.age || 0) < 18);
  const elders   = allMembers.filter(m => (m.age || 0) >= 65);
  const adults   = allMembers.filter(m => (m.age || 0) >= 18 && (m.age || 0) < 65);

  // ── Accessibility ─────────────────────────────────────────────────────────
  const wheelchairMembers = allMembers.filter(m =>
    (m.needs || []).some(n => /wheelchair|mobility/i.test(n))
  );
  const strollerMembers = allMembers.filter(m =>
    (m.age || 0) < 2 ||
    (m.needs || []).some(n => /stroller/i.test(n))
  );

  // ── Dietary ───────────────────────────────────────────────────────────────
  const allDietary = allMembers.flatMap(m => m.dietary || []);
  const dietaryNeeds = [...new Set(allDietary)];
  const vegetarianCount = allMembers.filter(m =>
    (m.dietary || []).some(d => /veg/i.test(d))
  ).length;

  // ── Interests (scored by frequency) ──────────────────────────────────────
  const interestFreq = {};
  allMembers.forEach(m => {
    (m.interests || []).forEach(i => {
      interestFreq[i] = (interestFreq[i] || 0) + 1;
    });
  });
  const interests = Object.entries(interestFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([i]) => i);

  // ── Pace — use most restrictive member preference ─────────────────────────
  const paceOrder = { relaxed: 0, moderate: 1, packed: 2 };
  const memberPaces = allMembers
    .map(m => m.pacePreference || 'moderate')
    .filter(p => paceOrder[p] !== undefined);
  const mostRestrictivePace = memberPaces.length
    ? memberPaces.reduce((min, p) => paceOrder[p] < paceOrder[min] ? p : min, 'moderate')
    : (trip.pace || 'moderate');
  const effectivePace = trip.pace || mostRestrictivePace;

  // ── Room requirements per family ──────────────────────────────────────────
  const familiesWithRooms = enrichedFamilies.map(f => {
    const fAdults   = f.members.filter(m => (m.age || 0) >= 18).length;
    const fKids     = f.members.filter(m => (m.age || 0) < 18).length;
    const fInfants  = f.members.filter(m => (m.age || 0) < 2).length;
    const fWheelchair = f.members.some(m => (m.needs || []).some(n => /wheelchair|mobility/i.test(n)));

    // 1 room per 2 adults; if has kids → need 1+ family rooms
    const baseRooms = Math.max(1, Math.ceil(fAdults / 2));
    // Extra room if kids can't share (rough heuristic: >2 kids or mixed ages)
    const kidRooms  = fKids > 2 ? 1 : 0;
    const roomsNeeded = baseRooms + kidRooms;

    return {
      ...f,
      memberCount: f.members.length,
      roomsNeeded,
      hasKids: fKids > 0,
      hasInfants: fInfants > 0,
      needsWheelchair: fWheelchair,
      needsFamilyRoom: fKids > 0,
    };
  });

  const totalRoomsNeeded = familiesWithRooms.reduce((s, f) => s + f.roomsNeeded, 0);
  const roomType = wheelchairMembers.length > 0 ? 'accessible'
    : (kids.length + infants.length) > 0     ? 'family'
    : 'standard';

  // ── Summary flags for LLM context ────────────────────────────────────────
  const flags = [
    infants.length  > 0 ? `${infants.length} infant${infants.length > 1 ? 's' : ''} (under 2) — nap schedule, stroller required` : null,
    kids.length     > 0 ? `${kids.length} child${kids.length > 1 ? 'ren' : ''} (ages ${kids.map(k => k.age).join(', ')}) — kid-friendly venues` : null,
    teens.length    > 0 ? `${teens.length} teen${teens.length > 1 ? 's' : ''} — appreciate independence, pop-culture & adventure` : null,
    elders.length   > 0 ? `${elders.length} elderly traveller${elders.length > 1 ? 's' : ''} — relaxed pace, accessible venues, early dinners` : null,
    wheelchairMembers.length > 0 ? `${wheelchairMembers.length} wheelchair user${wheelchairMembers.length > 1 ? 's' : ''} — every venue MUST be fully accessible` : null,
    strollerMembers.length  > 0 ? `Travelling with stroller — lifts/ramps required, no cobblestones` : null,
    vegetarianCount > 0 ? `${vegetarianCount} vegetarian${vegetarianCount > 1 ? 's' : ''} — restaurants must have solid veggie options` : null,
    dietaryNeeds.filter(d => !/veg/i.test(d)).length > 0
      ? `Dietary needs: ${dietaryNeeds.filter(d => !/veg/i.test(d)).join(', ')}` : null,
    interests.length > 0 ? `Group interests: ${interests.slice(0, 5).join(', ')}` : null,
    totalRoomsNeeded > 1 ? `Needs ${totalRoomsNeeded} rooms across ${families.length} group${families.length > 1 ? 's' : ''}` : null,
    families.length > 1 ? `Multi-family trip (${families.length} groups) — per-family expense tracking` : null,
  ].filter(Boolean);

  return {
    // Demographics
    totalMembers:   allMembers.length,
    totalFamilies:  families.length,
    families:       familiesWithRooms,
    members:        allMembers,

    // Age groups
    hasInfants:     infants.length > 0,
    hasKids:        kids.length > 0,
    hasTeens:       teens.length > 0,
    hasElders:      elders.length > 0,
    infantCount:    infants.length,
    kidCount:       kids.length,
    teenCount:      teens.length,
    elderCount:     elders.length,
    adultCount:     adults.length,

    // Accessibility
    hasWheelchair:   wheelchairMembers.length > 0,
    hasStroller:     strollerMembers.length > 0,
    wheelchairCount: wheelchairMembers.length,

    // Dietary
    dietaryNeeds,
    vegetarianCount,

    // Interests
    interests,

    // Preferences
    pace:   effectivePace,
    budget: trip.budget || 'mid-range',

    // Accommodation
    totalRoomsNeeded,
    roomType,

    // Flags for downstream prompts
    flags,
  };
}
