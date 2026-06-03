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

// Preferred start windows (min since midnight) for scheduleDay's per-type model.
const WINDOWS = {
  checkin:   16 * 60,        // hotel check-in — late afternoon, never morning
  checkout:  10 * 60,        // hotel check-out on the departure day — morning
  breakfast:  8 * 60,
  lunch:     LUNCH_MIN,
  dinner:    DINNER_MIN,
  nightlife: 20 * 60 + 30,   // bars / shows / concerts — evening
  sunrise:    6 * 60,
  sunset:    18 * 60 + 30,
};
const BREAKFAST_RE = /breakfast|brunch/i;
const SUNRISE_RE   = /sunrise/i;
const SUNSET_RE    = /sunset|viewpoint|lookout|observation deck/i;
const NIGHTLIFE_RE = /nightlife|night club|nightclub|\bbar\b|\bpub\b|concert|live music|\bshow\b|theatre|theater|opera|casino|cocktail/i;

// Meal probe windows (minutes-of-day). A restaurant is assigned a meal only if
// its hours of operation actually cover that window — a dinner-only steakhouse
// never gets slotted at lunch. The window midpoint is the probe time.
const MEAL_CHECK = {
  breakfast: [7 * 60,        10 * 60 + 30],
  lunch:     [11 * 60 + 30,  14 * 60 + 30],
  dinner:    [17 * 60 + 30,  21 * 60],
};
const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };

// Local weekday (0=Sun…6=Sat) for a 'YYYY-MM-DD' string; null if unparseable.
// Parsed field-by-field so it stays in local time (new Date('YYYY-MM-DD') is UTC).
function weekdayOf(date) {
  if (!date || typeof date !== 'string') return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getDay();
}

// Which meals a place (compact openHours: [{d,o,c}] in minutes) is open for on
// weekday `wd`. Returns null when hours are unknown (so the caller falls back to
// the order-based default), or [] when the place is closed all meal windows.
function mealsOpenFor(act, wd) {
  const oh = act.openHours;
  if (!Array.isArray(oh) || !oh.length || wd == null) return null;
  const todays = oh.filter(h => h.d === wd);
  if (!todays.length) return [];                       // explicitly closed that day
  const open = [];
  for (const meal of Object.keys(MEAL_CHECK)) {
    const [lo, hi] = MEAL_CHECK[meal];
    const mid = (lo + hi) / 2;
    if (todays.some(h => mid >= h.o && mid <= h.c)) open.push(meal);
  }
  return open;
}

// Earliest start >= `from` where [start, start+need] clears all occupied
// intervals and ends by `end`; null if it can't fit before day end. Module-level
// so both autoArrange and scheduleDay share it.
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

// ── Per-day arranger ──────────────────────────────────────────────
/**
 * scheduleDay — re-time and re-order ONE day's activities using the per-type
 * window model + proximity ordering. PURE: returns a NEW array of copies with
 * `time` assigned, sorted; never mutates the input. Notes/skipped are kept.
 *
 *   opts = { dayRole?: 'arrival'|'departure'|'normal', anchor?: {lat,lng},
 *            date?: 'YYYY-MM-DD' }   // date enables hours-of-operation meal fit
 *
 * Windows: hotel check-in → ~16:00 (check-out → ~10:00 on a departure day),
 * meals → breakfast/lunch/dinner picked from each place's HOURS OF OPERATION
 * (or the user's pinned `meal`), nightlife/shows → evening, sunrise/sunset →
 * their hours; everything else flows from the morning, ordered nearest-neighbour
 * around the day's hotel. Transport with a user-set time anchors the day.
 */
export function scheduleDay(activities, opts = {}) {
  const all = (activities || []).map(a => ({ ...a }));
  const sched = all.filter(a => a.type !== 'note' && a.status !== 'skipped');
  if (sched.length === 0) return activities ? activities.slice() : [];

  const dayRole = opts.dayRole || 'normal';
  const anchor = opts.anchor
    || sched.find(a => a.type === 'stay' && a.lat != null)
    || sched.find(a => a.lat != null) || null;
  const text = a => `${a.name || ''} ${a.detail || ''}`;

  const occ = [];
  const place = (a, target) => {
    const need = Math.max(BUFFER_MIN, estimateDuration(a));
    const start = findSlotMin(occ, target, need, DAY_END_MIN)
               ?? findSlotMin(occ, DAY_START_MIN, need, DAY_END_MIN) ?? target;
    a.time = minToTime(start);
    addInterval(occ, start, need);
  };

  // 1. Transport with a user-set time anchors the day (departures/arrivals).
  sched.filter(a => a.type === 'transport' && a.time)
       .forEach(a => addInterval(occ, timeToMin(a.time), Math.max(BUFFER_MIN, estimateDuration(a))));
  // 2. Stays → check-in window (or check-out on the departure day).
  sched.filter(a => a.type === 'stay')
       .forEach(a => place(a, dayRole === 'departure' ? WINDOWS.checkout : WINDOWS.checkin));
  // 3. Meals → breakfast / lunch / dinner. Each restaurant lands in a meal it is
  //    actually OPEN for (hours of operation), unless the user pinned a meal
  //    (`a.meal`) — their choice always wins. Among the meals a place is open
  //    for, the least-filled wins so two restaurants don't both land on dinner;
  //    when hours are unknown we keep the classic lunch-first-then-dinner order.
  const wd = weekdayOf(opts.date);
  const mealCount = { breakfast: 0, lunch: 0, dinner: 0 };
  const foods = sched.filter(a => a.type === 'food');
  const mealOf = new Map();
  // Pass 1: explicit user choice, or a clear breakfast/brunch by name.
  foods.forEach(a => {
    const explicit = a.meal && MEAL_CHECK[a.meal] ? a.meal
                   : BREAKFAST_RE.test(text(a)) ? 'breakfast' : null;
    if (explicit) { mealOf.set(a, explicit); mealCount[explicit]++; }
  });
  // Pass 2: everything else, decided from opening hours then balanced.
  foods.filter(a => !mealOf.has(a)).forEach(a => {
    const open = mealsOpenFor(a, wd);            // null = unknown, [] = closed all windows
    let meal;
    if (open && open.length) {
      const primary = open.filter(m => m !== 'breakfast');   // lunch/dinner are the main meals
      const pool = primary.length ? primary : open;
      meal = pool.slice().sort((x, y) => (mealCount[x] - mealCount[y]) || (MEAL_ORDER[x] - MEAL_ORDER[y]))[0];
    } else {
      meal = mealCount.lunch <= mealCount.dinner ? 'lunch' : 'dinner';
    }
    mealOf.set(a, meal); mealCount[meal]++;
  });
  foods.forEach(a => place(a, WINDOWS[mealOf.get(a)]));
  // 4. Window-anchored activities (sunrise / sunset / nightlife).
  const acts = sched.filter(a => a.type === 'activity');
  const windowFor = a => SUNRISE_RE.test(text(a)) ? WINDOWS.sunrise
                       : SUNSET_RE.test(text(a))   ? WINDOWS.sunset
                       : NIGHTLIFE_RE.test(text(a)) ? WINDOWS.nightlife : null;
  acts.filter(a => windowFor(a) != null).forEach(a => place(a, windowFor(a)));
  // 5. Remaining daytime activities flow from the morning, nearest-neighbour.
  const daytime = nearestNeighborOrder(acts.filter(a => windowFor(a) == null), anchor);
  let cursor = DAY_START_MIN;
  daytime.forEach(a => {
    const need = Math.max(BUFFER_MIN, estimateDuration(a));
    const start = findSlotMin(occ, cursor, need, DAY_END_MIN)
               ?? findSlotMin(occ, DAY_START_MIN, need, DAY_END_MIN) ?? cursor;
    a.time = minToTime(start);
    addInterval(occ, start, need);
    cursor = start + need + BUFFER_MIN;
  });

  return all.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}
