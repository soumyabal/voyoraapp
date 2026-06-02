/**
 * autoArrange.js — rule-based DRAFT arranger for a basket of chosen places.
 *
 * PURE function: no store access, no side effects, no API calls, no model calls.
 *
 * Design contract (this is what makes a fallible rule engine SAFE):
 *   1. It never writes to the trip. It returns a *draft* the user reviews and
 *      edits in a preview before anything is committed. When the rules guess
 *      wrong, the user fixes the draft — the real itinerary is never mangled.
 *   2. It treats user intent as INPUT, never something to infer. Per-event
 *      hints (`_hint.pinDay`, `_hint.dayCount`) let the user say "Disney on
 *      Day 2" or "theme park across 2 days" and the engine obeys.
 *   3. It MERGES around existing activities: it reads each day's current load
 *      and occupied times, then fills the gaps. Existing activities are read
 *      only — never moved, never overwritten.
 *
 * Input  basket : Array<Place>  where Place is the Discover shape:
 *                 { name, address, rating, costPerPerson, activityType,
 *                   lat, lng, city, url, wheelchairOk, types, _hint? }
 *                 _hint = { pinDay?: number, dayCount?: number }
 *        trip   : { days[], pace, families, ... }
 * Output { placements, unplaced, warnings, summary }
 *        placements : Activity[][]  aligned to trip.days — ONLY the new drafts
 *        unplaced   : Place[]       events that did not fit (shown, never dropped silently)
 *        warnings   : validateTrip() output for the merged result
 *        summary    : { placed, unplaced, daysUsed }
 */
import { timeToMin, minToTime } from './slots';
import { estimateDuration, validateTrip } from './tripValidator';

// Substantial activities allowed per day, by pace. Meals/notes/stays don't count.
const PACE_CAP = { relaxed: 3, moderate: 4, packed: 6 };
// Soft ceiling on substantial activity-minutes a day should hold (8 active hours).
const DAY_ACTIVE_BUDGET_MIN = 8 * 60;
// A venue this long (>=6h) "owns" its day — matches tripValidator's full-day rule.
const FULL_DAY_MIN = 360;
// Day scheduling window + spacing, and the windows meals aim for.
const BUFFER_MIN = 15;
const DAY_START_MIN = 9 * 60;    // 09:00
const DAY_END_MIN = 22 * 60;     // 22:00
const LUNCH_MIN = 12 * 60 + 30;  // 12:30
const DINNER_MIN = 19 * 60;      // 19:00

// ── Geo helpers ───────────────────────────────────────────────────
function haversine(a, b) {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return Infinity;
  const R = 6371, toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Greedy nearest-neighbor chain from an anchor. Items without coords keep their
// input order (haversine returns Infinity → never "nearest"), so missing
// lat/lng degrades gracefully instead of crashing.
function nearestNeighborOrder(items, anchor) {
  const remaining = items.slice();
  const ordered = [];
  let cursor = anchor && anchor.lat != null ? anchor : null;
  while (remaining.length) {
    let bestI = 0, bestD = Infinity;
    if (cursor) {
      for (let i = 0; i < remaining.length; i++) {
        const d = haversine(cursor, remaining[i]);
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    const [next] = remaining.splice(bestI, 1);
    ordered.push(next);
    if (next.lat != null) cursor = next;
  }
  return ordered;
}

// ── Place → draft Activity ────────────────────────────────────────
function placeToDraft(place, draftId, extra = {}) {
  return {
    id: draftId,        // temporary draft id; store assigns the real uid on Apply
    _draftId: draftId,  // stable React key for the preview
    type: place.activityType || 'activity',
    time: null,         // assigned during time placement
    name: place.name,
    detail: '',
    costPerPerson: place.costPerPerson || 0,
    costMode: 'per_person',
    costAmount: place.costPerPerson || 0,
    address: place.address || '',
    url: place.url || '',
    rating: place.rating ?? null,
    lat: place.lat ?? null,
    lng: place.lng ?? null,
    city: place.city || null,
    note: null,
    status: null,
    _source: place,     // back-reference so the UI can move/remove and re-key
    ...extra,
  };
}

// ── Main ──────────────────────────────────────────────────────────
export function autoArrange(basket, trip, opts = {}) {
  const days = trip.days || [];
  const dayCount = days.length;
  if (!Array.isArray(basket) || basket.length === 0 || dayCount === 0) {
    return { placements: days.map(() => []), unplaced: basket || [], warnings: [], summary: { placed: 0, unplaced: (basket || []).length, daysUsed: 0 } };
  }

  const cap = PACE_CAP[trip.pace] || PACE_CAP.moderate;
  let idSeq = 0;
  const nextId = () => `draft-${idSeq++}`;

  // Working occupancy per day: a mutable copy of existing (non-skipped)
  // activities that we GROW as we place drafts, so getSuggestedTime always
  // sees the latest state and flows times around everything already there.
  const work = days.map(d => ({
    activities: (d.activities || []).filter(a => a.status !== 'skipped').map(a => ({ ...a })),
  }));
  const added = days.map(() => []);   // the new drafts, aligned to days (our output)
  const unplaced = [];

  const substantialOn = i =>
    work[i].activities.filter(a => a.type !== 'food' && a.type !== 'note' && a.type !== 'stay').length;
  const capLeft = days.map((_, i) => Math.max(0, cap - substantialOn(i)));
  const loadMin = days.map((_, i) =>
    work[i].activities.filter(a => a.type !== 'note').reduce((s, a) => s + estimateDuration(a), 0));
  const wasEmpty = days.map((_, i) => substantialOn(i) === 0);   // captured before we place
  const dayAnchor = i => work[i].activities.find(a => a.type === 'stay' && a.lat != null) || null;

  // Reserve a draft into a day's plan (capacity + load bookkeeping only;
  // exact time is assigned later once a day's full set is known).
  function reserve(i, draft, needMin) {
    added[i].push(draft);
    capLeft[i] -= 1;
    loadMin[i] += needMin;
  }

  // Every city already present on a day (existing activities + drafts so far).
  function dayCities(i) {
    const set = new Set();
    for (const a of work[i].activities) if (a.city) set.add(a.city);
    for (const a of added[i]) if (a.city) set.add(a.city);
    return set;
  }
  // Pick a day for a regular item, in priority order:
  //   1. a day that already holds the SAME city (keeps a city together),
  //   2. a "clean" day with no DIFFERENT city on it (empty, or same-city only),
  //   3. any day with room — only if nothing cleaner exists.
  // This stops a day being topped up with a second city just because it had a
  // free capacity slot (the multi_city_day trap).
  function bestDayFor(item, needMin) {
    let cleanDay = -1, anyRoom = -1;
    for (let i = 0; i < dayCount; i++) {
      if (capLeft[i] <= 0) continue;
      const emptyDay = wasEmpty[i] && added[i].length === 0;
      if (loadMin[i] + needMin > DAY_ACTIVE_BUDGET_MIN && !emptyDay) continue;
      if (anyRoom === -1) anyRoom = i;
      const cities = dayCities(i);
      if (item.city && cities.has(item.city)) return i;             // 1 · same city
      if (cleanDay === -1 && (!item.city || cities.size === 0)) cleanDay = i; // 2 · clean
    }
    return cleanDay !== -1 ? cleanDay : anyRoom;                    // 3 · fallback
  }

  // 1) PINNED items — user intent wins; place even if over capacity.
  const pinned = basket.filter(p => p._hint?.pinDay != null && p._hint.pinDay >= 0 && p._hint.pinDay < dayCount);
  for (const p of pinned) {
    reserve(p._hint.pinDay, placeToDraft(p, nextId()), estimateDuration(placeToDraft(p, 'tmp')));
  }
  const pinnedSet = new Set(pinned);

  // 2) FULL-DAY venues (or any item the user asked to span multiple days).
  //    Each instance claims its own day, preferring days that are still empty.
  const rest = basket.filter(p => !pinnedSet.has(p));
  const meals = rest.filter(p => p.activityType === 'food');
  const nonMeals = rest.filter(p => p.activityType !== 'food');

  const isFullDay = p => estimateDuration(placeToDraft(p, 'tmp')) >= FULL_DAY_MIN || (p._hint?.dayCount || 1) > 1;
  const fullDayItems = nonMeals.filter(isFullDay);
  const regularItems = nonMeals.filter(p => !isFullDay(p));

  for (const p of fullDayItems) {
    const spans = Math.max(1, p._hint?.dayCount || 1);
    let placedDays = 0;
    // Prefer empty days, then any day with capacity.
    const order = days.map((_, i) => i)
      .sort((a, b) => (wasEmpty[b] - wasEmpty[a]) || (capLeft[b] - capLeft[a]) || (a - b));
    for (const i of order) {
      if (placedDays >= spans) break;
      if (capLeft[i] <= 0 && !wasEmpty[i]) continue;
      const draft = placeToDraft(p, nextId(), spans > 1 ? { repeatIntent: true } : {});
      reserve(i, draft, estimateDuration(draft));
      placedDays++;
    }
    if (placedDays === 0) unplaced.push(p);
  }

  // 3) REGULAR items — cluster by city, nearest-neighbor order, fill days.
  const byCity = new Map();
  for (const p of regularItems) {
    const key = p.city || '__none__';
    if (!byCity.has(key)) byCity.set(key, []);
    byCity.get(key).push(p);
  }
  for (const [, group] of byCity) {
    const ordered = nearestNeighborOrder(group, null);
    for (const p of ordered) {
      const draft = placeToDraft(p, nextId());
      const need = estimateDuration(draft);
      const i = bestDayFor(p, need);
      if (i === -1) { unplaced.push(p); continue; }
      reserve(i, draft, need);
    }
  }

  // 4) MEALS — drop lunch/dinner into days that ended up with activities.
  //    Meals don't count against the substantial cap; max two per day.
  const mealsPerDay = days.map(() => 0);
  let mealCursor = 0;
  const daysWithActivity = days.map((_, i) => i).filter(i => added[i].length > 0 || !wasEmpty[i]);
  for (const meal of meals) {
    // round-robin across active days, keeping <=2 meals added per day
    let placed = false;
    for (let k = 0; k < daysWithActivity.length; k++) {
      const i = daysWithActivity[(mealCursor + k) % daysWithActivity.length];
      if (mealsPerDay[i] >= 2) continue;
      const draft = placeToDraft(meal, nextId());
      added[i].push(draft);
      loadMin[i] += estimateDuration(draft);
      mealsPerDay[i]++;
      mealCursor = (mealCursor + k + 1) % daysWithActivity.length;
      placed = true;
      break;
    }
    if (!placed) unplaced.push(meal);
  }

  // 5) TIME ASSIGNMENT — sequential packer that merges around existing items.
  //    Meal windows (lunch/dinner) are reserved FIRST, then activities flow
  //    around them from the day start. This is fully predictable and never
  //    produces pre-dawn times (the slot-gap-from-midnight trap).
  function occupiedIntervals(i) {
    return work[i].activities
      .filter(a => a.time && a.type !== 'note')
      .map(a => { const s = timeToMin(a.time); return [s, s + Math.max(BUFFER_MIN, estimateDuration(a))]; })
      .sort((x, y) => x[0] - y[0]);
  }
  // Earliest start >= `from` where [start, start+need] clears all occupied
  // intervals and ends by `end`; null if it can't fit before day end.
  function findSlotMin(occ, from, need, end) {
    let cur = Math.max(from, DAY_START_MIN);
    for (const [s, e] of occ) {
      if (e <= cur) continue;
      if (s - cur >= need) return cur;
      cur = e + BUFFER_MIN;
    }
    return cur + need <= end ? cur : null;
  }
  const addInterval = (occ, start, need) => { occ.push([start, start + need]); occ.sort((x, y) => x[0] - y[0]); };

  for (let i = 0; i < dayCount; i++) {
    const dayDrafts = added[i];
    if (dayDrafts.length === 0) continue;

    const activities = nearestNeighborOrder(dayDrafts.filter(d => d.type !== 'food'), dayAnchor(i));
    const dayMeals   = dayDrafts.filter(d => d.type === 'food');
    const occ        = occupiedIntervals(i);

    // Reserve meal windows first (first meal → lunch, rest → dinner).
    dayMeals.forEach((m, mi) => {
      const need   = Math.max(BUFFER_MIN, estimateDuration(m));
      const target = mi === 0 ? LUNCH_MIN : DINNER_MIN;
      const start  = findSlotMin(occ, target, need, DAY_END_MIN)
                  ?? findSlotMin(occ, DAY_START_MIN, need, DAY_END_MIN)
                  ?? target;
      m.time = minToTime(start);
      addInterval(occ, start, need);
    });

    // Flow activities from the day start, around meals + existing items.
    let cursor = DAY_START_MIN;
    for (const a of activities) {
      const need  = Math.max(BUFFER_MIN, estimateDuration(a));
      const start = findSlotMin(occ, cursor, need, DAY_END_MIN)
                 ?? findSlotMin(occ, DAY_START_MIN, need, DAY_END_MIN)
                 ?? cursor;
      a.time = minToTime(start);
      addInterval(occ, start, need);
      cursor = start + need + BUFFER_MIN;
    }

    added[i].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  // 6) Validate the MERGED result so the preview can surface any remaining
  //    tightness (overlaps, packed days) the same way Trip Check does.
  const merged = { ...trip, days: days.map((d, i) => ({ ...d, activities: [...d.activities, ...added[i]] })) };
  const warnings = validateTrip(merged);

  const placed = added.reduce((s, arr) => s + arr.length, 0);
  return {
    placements: added,
    unplaced,
    warnings,
    summary: { placed, unplaced: unplaced.length, daysUsed: added.filter(a => a.length > 0).length },
  };
}
