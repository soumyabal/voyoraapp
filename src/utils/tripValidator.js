/**
 * tripValidator.js
 *
 * Intelligent trip validation engine.
 *
 * Given a trip's day-by-day itinerary, produces a list of warnings
 * with severity levels: 'error' | 'warning' | 'info'
 *
 * Severity philosophy (so we don't "cry wolf" — most rules are heuristics):
 *   error   → a PROVABLE, blocking conflict the app is sure of (venue closed at
 *             that time; a 6h+ journey crammed with other stops that can't fit).
 *             Only these reach the trip's status badge and read as "needs fixing".
 *   warning → a real, data-backed thing worth checking (unbooked night, big
 *             overlap, dietary clash, duplicate, multi-city day).
 *   info    → a soft, ESTIMATE-based heads-up / suggestion (tight travel time,
 *             busy day, no meal). These are tips, never alarms.
 * Estimate-driven rules (travel time, packed day, small overlaps) are deliberately
 * kept at 'info' — the duration/distance model is approximate, so dressing a guess
 * in red trains users to distrust the signal.
 *
 * Duration estimates are drawn from industry tourism data:
 *   - Theme parks: 6-8h (TripAdvisor/Lonely Planet guidelines)
 *   - Museums: 1.5-4h depending on size
 *   - Meals: 45min–2.5h depending on type
 *   - Transport: type-based defaults + airport buffer
 *
 * Rules checked:
 *   1. Activity overlap (next starts before estimated previous end)
 *   2. Full-day venue crammed with other activities
 *   3. Overpacked day (8+ activities)
 *   4. No meal stop on a long day
 *   5. Past-midnight end
 *   6. Very early non-transport start (< 6am)
 *   7. Empty day — ALL days, warning severity (common AI miss on 7+ day trips)
 *   8. Notes-only day — has notes but no real activities
 *   9. Multi-day journey — transport arriveTime < departTime (crosses midnight)
 *  10. Wake time conflict — non-transport activity too early for late/regular families
 *  11. Dietary conflict — food activity name contains meat/alcohol keywords vs group dietary profile
 */

import { travelLeg, formatKm } from './geo';
import { weekdayOf, isOpenAt, hoursLabel } from './hours';

// ─── Dietary conflict patterns ────────────────────────────────────
const MEAT_RE = /\b(beef|pork|lamb|chicken|mutton|fish|prawn|shrimp|seafood|lobster|crab|oyster|sashimi|sushi|steak|burger|bbq|barbecue|bacon|ham|salami|pepperoni|chorizo|meat|non.?veg)\b/i;
const ALCO_RE = /\b(beer|wine|cocktail|whisky|whiskey|vodka|rum|gin|spirits|alcohol|brewery|pub|bar|tavern|champagne|prosecco|sake|sangria|mojito|margarita|tequila)\b/i;

// ─── Seasonal-prone venues ────────────────────────────────────────
// Places whose hours commonly change by season — so the weekly snapshot we cached
// (Google's regularOpeningHours = a snapshot of the CURRENT season) can't be
// trusted for a future trip date. For these we never hard-flag "closed"; we soften
// to a "verify hours for your dates" tip. Bias is deliberate: a false "closed"
// (deleting a place that's actually open) is worse than a soft verify nudge.
const SEASONAL_RE = /\b(water ?park|aquapark|beach|ski resort|skiing|snowboard|snow park|ice rink|outdoor pool|botanical|arboretum|vineyard|winery|orchard|national park|state park|hiking|nature trail|kayak|canoe|rafting|surfing|snorkel|scuba|diving|boat tour|sunset cruise|dinner cruise|ferry|festival|farmers? market|night market|open.?air|amusement park|theme park|safari|waterfall)\b/i;

/** Best link to the venue's live, authoritative hours (for the "verify" tap-through). */
function verifyHoursUrl(act) {
  return (
    act.url ||
    act.mapUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.name || '')}`
  );
}

// ─── Duration estimation ──────────────────────────────────────────

/**
 * Returns estimated duration in minutes for a given activity.
 * Uses keyword matching on name + detail fields.
 */
export function estimateDuration(activity) {
  // Manual override always wins — covers long-haul flights, multi-day treks, etc.
  if (activity.durationMins > 0) return activity.durationMins;

  const name   = (activity.name   || '').toLowerCase();
  const detail = (activity.detail || '').toLowerCase();
  const text   = `${name} ${detail}`;

  // ── Transport ────────────────────────────────────────────────────
  if (activity.type === 'transport') {
    switch (activity.subtype) {
      case 'flight':  return 180;  // flight + 2h airport buffer
      case 'car':     return 120;  // default drive
      case 'train':   return 90;
      case 'ship':    return 240;
      case 'pitstop': return 15;   // fuel stop, rest stop, quick break
      default:        return 120;
    }
  }

  // ── Stay (check-in/out) ──────────────────────────────────────────
  if (activity.type === 'stay') return 60;

  // ── Note ─────────────────────────────────────────────────────────
  if (activity.type === 'note') return 0;

  // ── Food — keyword refinement ────────────────────────────────────
  if (activity.type === 'food') {
    if (/fine dining|tasting menu|omakase|degustation|multi.?course/i.test(text)) return 150;
    if (/dinner|supper/i.test(text))     return 105;
    if (/lunch/i.test(text))             return 75;
    if (/breakfast|brunch/i.test(text))  return 45;
    if (/coffee|cafe|café|snack|street food|food court/i.test(text)) return 30;
    return 75; // default meal
  }

  // ── Activity — ordered from most-specific to least ───────────────
  const RULES = [
    // Theme parks — full day
    { re: /disneyland|disney world|disney resort|universal studio|universal orlando|busch gardens|six flags|cedar point|legoland|seaworld/i, d: 480 },
    { re: /theme park|amusement park/i, d: 480 },
    { re: /water park|waterpark|aquaventura/i, d: 300 },

    // Zoos & wildlife
    { re: /safari|wildlife safari/i,        d: 360 },
    { re: /zoo|animal park|wildlife park/i, d: 240 },
    { re: /aquarium|oceanarium|marine park/i, d: 120 },

    // Major world museums (require more time)
    { re: /louvre|british museum|smithsonian|metropolitan museum|met museum|prado|uffizi|hermitage|vatican museum|rijksmuseum|pergamon|national history museum/i, d: 240 },

    // General museums & galleries
    { re: /museum/i,    d: 120 },
    { re: /art gallery|gallery|contemporary art/i, d: 90 },
    { re: /exhibition|exhibit|expo\b/i, d: 90 },

    // Historical & monuments
    { re: /palace|chateau|ch[aâ]teau/i,   d: 120 },
    { re: /castle|fort\b|fortress/i,       d: 120 },
    { re: /ruins|archaeological site|ancient city|heritage site/i, d: 120 },
    { re: /cathedral|basilica|abbey|monastery|convent/i, d: 60 },
    { re: /temple|shrine|pagoda|mosque|synagogue|mandir|gurudwara/i, d: 60 },
    { re: /church\b/i, d: 45 },
    { re: /taj mahal|colosseum|acropolis|machu picchu|angkor wat|great wall|stonehenge/i, d: 180 },

    // Day trips & multi-hour excursions
    { re: /full.?day|whole day|all.?day/i, d: 420 },
    { re: /half.?day/i, d: 210 },
    { re: /day trip|day tour|day excursion/i, d: 420 },

    // Hiking & trekking
    { re: /full.?day hike|full.?day trek|overnight trek/i, d: 480 },
    { re: /hike|hiking|trek|trekking|trail\b|nature walk/i, d: 180 },

    // Parks & gardens
    { re: /national park|nature reserve/i, d: 240 },
    { re: /botanical garden|arboretum/i,   d: 120 },
    { re: /park\b|garden\b/i,              d: 90 },

    // Beach & water
    { re: /beach\b/i, d: 180 },
    { re: /scuba|diving\b|dive\b/i,        d: 180 },
    { re: /snorkel/i,                      d: 120 },
    { re: /surfing|surf lesson/i,          d: 150 },
    { re: /kayak|canoe|paddleboard/i,      d: 120 },
    { re: /day cruise|dinner cruise|sunset cruise/i, d: 360 },
    { re: /boat tour|boat trip|boat ride/i, d: 150 },
    { re: /island hopping/i,              d: 360 },

    // Classes & experiences
    { re: /cooking class|culinary class|cooking lesson/i, d: 180 },
    { re: /wine tasting|food tasting|brewery tour/i, d: 90 },
    { re: /spa\b|massage|wellness centre/i, d: 90 },
    { re: /yoga|meditation/i,              d: 75 },

    // Shopping
    { re: /shopping mall|department store/i, d: 120 },
    { re: /market|bazaar|souq|souk|bazar|night market/i, d: 120 },
    { re: /shopping/i, d: 90 },

    // Entertainment
    { re: /concert|music festival|festival/i, d: 180 },
    { re: /show|performance|theatre|theater|opera|ballet|musical|circus/i, d: 150 },
    { re: /sports|match|game|stadium|arena/i, d: 180 },
    { re: /escape room/i,                d: 90 },
    { re: /movie|cinema|film/i,          d: 150 },

    // Quick stops
    { re: /photo stop|photo opportunity|viewpoint|lookout|observation deck|sunset|sunrise/i, d: 45 },
    { re: /waterfall/i, d: 60 },
  ];

  for (const { re, d } of RULES) {
    if (re.test(text)) return d;
  }

  return 120; // default: 2 hours
}

/**
 * Returns a human-readable duration string.
 */
export function formatDuration(mins) {
  if (mins < 60)  return `${mins} min`;
  const h = mins / 60;
  const rounded = Math.round(h * 2) / 2; // nearest 0.5h
  return rounded === Math.floor(rounded) ? `${rounded}h` : `~${rounded}h`;
}

// ─── Lodging derivation ───────────────────────────────────────────
/**
 * Where the group sleeps the NIGHT OF trip.days[dayIndex].
 *
 * A hotel is stored as ONE check-in `stay` activity carrying the booking total
 * and a `nights` count — never duplicated per night. This derives which days a
 * booking covers (so the cost stays on a single record and can't double-bill).
 *
 * Returns one of:
 *   { stay, checkInDayIndex, nights, nightNumber, isCheckInDay, isLastNight }
 *   { overnightTransit: activity }   // red-eye / sleeper train → no hotel tonight
 *   { nightPlan: reason }            // user said it's handled (with friends, camping…)
 *   null                             // genuinely unbooked night
 */
export function lodgingForNight(trip, dayIndex) {
  const days = trip?.days || [];
  const day = days[dayIndex];
  if (!day) return null;

  // Overnight travel wins: a transport that crosses midnight = you sleep en route.
  // (Same midnight-cross signal Rule 8 uses: arriveTime earlier than departTime.)
  const overnight = (day.activities || []).find(a =>
    a.type === 'transport' && a.status !== 'skipped' && a.arriveTime && a.arriveTime < (a.time || '00:00'));
  if (overnight) return { overnightTransit: overnight };

  // Scan back to the most recent check-in; it covers night i when
  // checkInIdx <= i < checkInIdx + nights. The first stay we hit decides it —
  // if it has already checked out, tonight is unbooked (you don't reopen it).
  for (let i = dayIndex; i >= 0; i--) {
    const stay = (days[i]?.activities || []).find(a => a.type === 'stay' && a.status !== 'skipped');
    if (!stay) continue;
    const nights = Math.max(1, stay.nights || 1);
    if (dayIndex < i + nights) {
      return {
        stay, checkInDayIndex: i, nights,
        nightNumber: dayIndex - i + 1,
        isCheckInDay: dayIndex === i,
        isLastNight: dayIndex === i + nights - 1,
      };
    }
    break;   // checked out before tonight → fall through to a manual night-plan / unbooked
  }
  // No hotel covers tonight, but the user may have told us how it's handled
  // (overnight travel, staying with friends/family, camping, heading home).
  if (day.nightPlan) return { nightPlan: day.nightPlan };
  return null;
}

// ─── Per-day routing anchors ──────────────────────────────────────
// The geographic points a day's plan routes between: you START where you woke
// (last night's hotel; Day 1 → the trip's starting point) and END where you sleep
// tonight (the hotel). Derived from lodgingForNight + trip.origin — no per-day
// rows, no double-billing. Uniform return shape {lat,lng,label,source} | null, so
// a future check-in/out-DATE model only changes lodgingForNight's internals, not
// these callers (auto-arrange, the day router, Google Maps export).

/** A lodgingForNight result → a uniform coord anchor (or null when it has no coords). */
function stayAnchor(lod, source = 'stay') {
  const s = lod?.stay;
  return s && s.lat != null && s.lng != null
    ? { lat: s.lat, lng: s.lng, label: s.name, source }
    : null;
}

/** A hotel-less-but-located night (friends/camping with an address) → a uniform
 *  anchor, exactly like a hotel. null unless the night-plan carries coords. */
function nightPlanAnchor(lod) {
  const np = lod?.nightPlan;
  return np && np.lat != null && np.lng != null
    ? { lat: np.lat, lng: np.lng, label: np.label || 'Where you stayed', source: 'nightPlan' }
    : null;
}

/** The trip's starting point as an anchor (null without coords). */
function originAnchor(trip) {
  const o = trip?.origin;
  return o && o.lat != null && o.lng != null
    ? { lat: o.lat, lng: o.lng, label: o.label, source: 'origin' }
    : null;
}

/** Where you WAKE on day i: Day 1 → trip.origin; otherwise where last night put you
 *  — a hotel, a friends/camping address, or (heading home) back at the origin. */
export function dayStartAnchor(trip, i) {
  if (i === 0) return originAnchor(trip);
  const lod = lodgingForNight(trip, i - 1);
  if (lod?.nightPlan?.type === 'heading_home') return originAnchor(trip);
  return stayAnchor(lod) || nightPlanAnchor(lod);
}

/** Where you SLEEP on day i: tonight's hotel, a located night-plan, or the origin
 *  if heading home (null when truly unknown — overnight travel / unbooked). */
export function dayEndAnchor(trip, i) {
  const lod = lodgingForNight(trip, i);
  if (lod?.nightPlan?.type === 'heading_home') return originAnchor(trip);
  return stayAnchor(lod) || nightPlanAnchor(lod);
}

/**
 * Best anchor to route day i's stops around — never throws, degrades gracefully:
 * where you woke → tonight's hotel → the day's first located stop. `dayActs` is
 * that day's activity array (for the fallback).
 */
export function dayRouteAnchor(trip, i, dayActs = []) {
  const fromStop = dayActs.find((a) => a.lat != null && a.lng != null);
  return (
    dayStartAnchor(trip, i) ||
    dayEndAnchor(trip, i) ||
    (fromStop ? { lat: fromStop.lat, lng: fromStop.lng, label: fromStop.name, source: 'stop' } : null)
  );
}

// ─── Per-day validation ───────────────────────────────────────────

function validateDay(day, dayIndex, families = []) {
  const warnings = [];

  // Sort non-skipped activities by time
  const acts = [...day.activities]
    .filter(a => a.status !== 'skipped')
    .sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));

  if (acts.length === 0) return warnings;

  // Build timeline with estimated end times
  const timeline = acts.map(act => {
    const parts = (act.time || '09:00').split(':');
    const startMin = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    const duration = estimateDuration(act);
    return { act, startMin, duration, endMin: startMin + duration };
  });

  // ── Rule 1: Schedule overlaps ─────────────────────────────────────
  for (let i = 0; i < timeline.length - 1; i++) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    if (curr.duration > 0 && curr.endMin > next.startMin) {
      const overlapMin = curr.endMin - next.startMin;
      warnings.push({
        type:          'overlap',
        // Estimate-based (durations are guessed) → big overlap = worth checking,
        // small = a tip. Never an 'error' (we're not sure enough to alarm).
        severity:      overlapMin >= 90 ? 'warning' : 'info',
        icon:          '⏱',
        title:         'Schedule overlap',
        message:       `"${curr.act.name}" typically takes ${formatDuration(curr.duration)}, overlapping with "${next.act.name}" by ~${overlapMin} min.`,
        hint:          `Move "${next.act.name}" to ${formatEndTime(curr.endMin)} or later.`,
        suggestedTime:      formatEndTime(curr.endMin),
        moveActId:          next.act.id,
        moveActName:        next.act.name,
        impactedActivities: [{
          id:            next.act.id,
          name:          next.act.name,
          time:          next.act.time,
          suggestedTime: formatEndTime(curr.endMin),
        }],
        dayIndex,
        actIds: [curr.act.id, next.act.id],
      });
    }
  }

  // ── Rule 1b: Not enough travel time between far-apart stops ───────
  // Distance-aware. Even when two stops don't strictly overlap, if they're far
  // apart and the next starts before you could realistically get there, flag it.
  // Pure overlaps are left to Rule 1; this catches "back-to-back but across town".
  // Uses the free haversine estimate (Phase 2: real routing).
  for (let i = 0; i < timeline.length - 1; i++) {
    const curr = timeline[i];
    const next = timeline[i + 1];
    if (curr.duration <= 0) continue;
    if (curr.act.type === 'transport' || next.act.type === 'transport') continue; // the drive IS the travel
    const leg = travelLeg(curr.act, next.act);
    if (!leg || leg.min < 10) continue;            // unknown coords, or a trivial hop
    const gap = next.startMin - curr.endMin;       // free minutes between end and next start
    if (gap < 0 || gap >= leg.min) continue;       // overlap → Rule 1; enough time → fine
    const short = leg.min - gap;
    if (short < 5) continue;                        // within rounding noise
    warnings.push({
      type:     'travel_time',
      // Straight-line estimate (not real routing) — the biggest false-alarm risk,
      // so it's always a soft tip, never red.
      severity: 'info',
      icon:     leg.mode === 'walk' ? '🚶' : '🚗',
      title:    'Tight travel time',
      message:  `"${next.act.name}" starts ${formatDuration(gap)} after "${curr.act.name}" ends, but they're ~${formatKm(leg.km)} apart (~${leg.min} min ${leg.mode}).`,
      hint:     `Start "${next.act.name}" around ${formatEndTime(curr.endMin + leg.min)} or later, or add the drive between them.`,
      suggestedTime:      formatEndTime(curr.endMin + leg.min),
      moveActId:          next.act.id,
      moveActName:        next.act.name,
      impactedActivities: [{
        id:            next.act.id,
        name:          next.act.name,
        time:          next.act.time,
        suggestedTime: formatEndTime(curr.endMin + leg.min),
      }],
      dayIndex,
      actIds: [curr.act.id, next.act.id],
    });
  }

  // ── Rule 2: Full-day venue with too many other activities ─────────
  // Transport activities are intentionally excluded — long flights are
  // handled by the trip-level long_journey_conflict rule instead.
  const fullDayItems = timeline.filter(t => t.duration >= 360 && t.act.type !== 'transport');
  fullDayItems.forEach(({ act }) => {
    const others = acts.filter(a => a.id !== act.id && a.type !== 'note' && a.type !== 'food');
    if (others.length >= 2) {
      warnings.push({
        type:     'full_day_conflict',
        severity: 'warning',   // estimate-based (full-day duration is a guess) → check, not block
        icon:     '🎡',
        title:    'Full-day venue',
        message:  `"${act.name}" typically takes a full day (${formatDuration(estimateDuration(act))}). ${others.length} other activities may not fit.`,
        hint:     'Move other major activities to a different day.',
        dayIndex,
        actIds:   [act.id],
      });
    }
  });

  // ── Rule 3: Overpacked day ────────────────────────────────────────
  const substantialActs = acts.filter(a => a.type !== 'note' && a.type !== 'stay');
  if (substantialActs.length >= 8) {
    warnings.push({
      type:     'packed',
      severity: 'info',   // a heuristic count → a gentle tip, not a warning
      icon:     '😓',
      title:    'Busy day',
      message:  `${substantialActs.length} activities in one day is ambitious. You may feel rushed.`,
      hint:     'Spread some activities to adjacent days for a more relaxed pace.',
      dayIndex,
    });
  }

  // ── Rule 4: No meal on a long day ────────────────────────────────
  const totalDaySpan = timeline[timeline.length - 1].endMin - timeline[0].startMin;
  const hasMeal = acts.some(a => a.type === 'food');
  if (!hasMeal && totalDaySpan >= 4 * 60 && substantialActs.length >= 3) {
    warnings.push({
      type:     'no_meal',
      severity: 'info',
      icon:     '🍽️',
      title:    'No meal planned',
      message:  `This is a ${formatDuration(totalDaySpan)} day with no food stops.`,
      hint:     'Add a lunch or dinner stop to keep the group energised.',
      dayIndex,
    });
  }

  // ── Rule 5: Past-midnight end ─────────────────────────────────────
  const lastItem = timeline[timeline.length - 1];
  if (lastItem.endMin >= 24 * 60) {
    const overMin = lastItem.endMin - 24 * 60;
    warnings.push({
      type:     'past_midnight',
      severity: 'info',
      icon:     '🌙',
      title:    'Runs past midnight',
      message:  `"${lastItem.act.name}" (start ${lastItem.act.time}, ${formatDuration(lastItem.duration)}) may end ~${formatDuration(overMin)} into the next day.`,
      hint:     'Start it earlier or move it to an evening slot.',
      dayIndex,
      actIds:   [lastItem.act.id],
    });
  }

  // ── Rule 6: Very early non-transport start ────────────────────────
  const firstItem = timeline[0];
  if (firstItem.startMin < 6 * 60 && firstItem.act.type !== 'transport') {
    warnings.push({
      type:     'early_start',
      severity: 'info',
      icon:     '⏰',
      title:    'Very early start',
      message:  `"${firstItem.act.name}" is scheduled at ${firstItem.act.time} — before 6am.`,
      hint:     'Check if this is intentional (e.g. a sunrise trek).',
      dayIndex,
      actIds:   [firstItem.act.id],
    });
  }

  // ── Rule 8: Multi-day journey (arriveTime crosses midnight) ──────
  // When a transport activity has arriveTime set and it is earlier in
  // the clock than departTime, the journey crosses midnight and the
  // arrival logically belongs on the next day.
  acts.filter(a => a.type === 'transport' && a.arriveTime).forEach(act => {
    const crossesMidnight = act.arriveTime < act.time; // e.g. departs 22:00, arrives 06:00
    if (crossesMidnight) {
      warnings.push({
        type:     'multi_day_journey',
        severity: 'info',
        icon:     '🌙',
        title:    'Overnight journey',
        message:  `"${act.name}" departs ${act.time} and arrives ${act.arriveTime} — looks like it crosses midnight into the next day.`,
        hint:     'Consider adding the arrival on the next day so your schedule stays accurate.',
        dayIndex,
        actIds:   [act.id],
      });
    }
  });

  // ── Rule 9: Wake time conflict ────────────────────────────────────
  // 'late' families shouldn't have non-transport activities before 9am.
  // 'regular' (default) families shouldn't have non-transport before 7am.
  // 'early' families have no restriction.
  if (families.length > 0) {
    const lateFamilies    = families.filter(f => f.wakeTime === 'late').map(f => f.name);
    const regularFamilies = families.filter(f => !f.wakeTime || f.wakeTime === 'regular').map(f => f.name);

    timeline.forEach(({ act, startMin }) => {
      if (act.type === 'transport' || act.type === 'note') return;
      if (startMin < 9 * 60 && lateFamilies.length > 0) {
        warnings.push({
          type:     'wake_time',
          severity: 'info',   // a soft preference heads-up, not a hard problem
          icon:     '🦉',
          title:    'Early for late risers',
          message:  `"${act.name}" starts at ${act.time} — ${lateFamilies.join(', ')} tend to wake late (after 9am).`,
          hint:     'Consider moving this activity to the afternoon, or confirm the group is OK with an early start.',
          dayIndex,
          actIds:   [act.id],
        });
      } else if (startMin < 7 * 60 && regularFamilies.length > 0) {
        warnings.push({
          type:     'wake_time',
          severity: 'info',
          icon:     '⏰',
          title:    'Very early for the group',
          message:  `"${act.name}" starts at ${act.time} — before 7am for ${regularFamilies.join(', ')}.`,
          hint:     'Check this is intentional (e.g. a sunrise trek or early flight connection).',
          dayIndex,
          actIds:   [act.id],
        });
      }
    });
  }

  // ── Rule 10: Dietary conflict ─────────────────────────────────────
  if (families.length > 0) {
    const vegFamilies    = families.filter(f => (f.dietary || []).some(d => d === 'vegetarian' || d === 'vegan')).map(f => f.name);
    const noAlcoFamilies = families.filter(f => (f.dietary || []).includes('no-alcohol')).map(f => f.name);

    acts.filter(a => a.type === 'food').forEach(act => {
      const text = `${act.name} ${act.detail || ''}`;
      if (vegFamilies.length > 0 && MEAT_RE.test(text)) {
        warnings.push({
          type:     'dietary_conflict',
          severity: 'warning',
          icon:     '🥦',
          title:    'Dietary conflict',
          message:  `"${act.name}" may contain meat/seafood — ${vegFamilies.join(', ')} are vegetarian/vegan.`,
          hint:     'Confirm this restaurant has suitable vegetarian options, or swap for a veg-friendly place.',
          dayIndex,
          actIds:   [act.id],
        });
      }
      if (noAlcoFamilies.length > 0 && ALCO_RE.test(text)) {
        warnings.push({
          type:     'dietary_conflict',
          severity: 'warning',
          icon:     '🚫',
          title:    'Alcohol in activity',
          message:  `"${act.name}" involves alcohol — ${noAlcoFamilies.join(', ')} prefer no alcohol.`,
          hint:     'Check if a non-alcoholic option is available, or consider an alternative activity.',
          dayIndex,
          actIds:   [act.id],
        });
      }
    });
  }

  // ── Rule 11: Duplicate activity (same event added more than once today) ──
  // Transport (drives, pit stops) can legitimately repeat; notes are free-form.
  const byName = new Map();
  acts.forEach(a => {
    if (a.type === 'transport' || a.type === 'note') return;
    const key = (a.name || '').trim().toLowerCase();
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(a);
  });
  byName.forEach(group => {
    if (group.length > 1) {
      warnings.push({
        type:     'duplicate_activity',
        severity: 'warning',
        icon:     '🔁',
        title:    'Added more than once',
        message:  `"${group[0].name}" appears ${group.length} times on this day.`,
        hint:     'Remove the extra copy unless the repeat is intentional.',
        dayIndex,
        actIds:   group.map(a => a.id),
      });
    }
  });

  // ── Rule 12: Activities span multiple cities in one day ──
  // Uses the `city` tag set when a place is added from Discover. Transport is
  // excluded — the drive between cities is exactly how you'd bridge them.
  const cityTagged = acts.filter(a => a.city && a.type !== 'transport');
  const distinctCities = [...new Set(cityTagged.map(a => a.city))];
  if (distinctCities.length >= 2) {
    warnings.push({
      type:     'multi_city_day',
      severity: 'warning',
      icon:     '🗺️',
      title:    'Activities in multiple cities',
      message:  `This day mixes ${distinctCities.join(' and ')}. Travelling between cities mid-day can eat hours.`,
      hint:     'Keep each city to its own day, or add the inter-city transport.',
      dayIndex,
      actIds:   cityTagged.map(a => a.id),
    });
  }

  // ── Rule 13a: Permanently / temporarily closed (Google businessStatus) ──
  // A date-INDEPENDENT, high-signal fact — unlike weekly hours it isn't a seasonal
  // snapshot. Only set on places added from Discover after this shipped.
  timeline.forEach(({ act }) => {
    if (act.businessStatus === 'CLOSED_PERMANENTLY') {
      warnings.push({
        type: 'closed_permanently', severity: 'error', icon: '🚫',
        title: 'Permanently closed',
        message: `"${act.name}" is marked permanently closed.`,
        hint: 'Remove it and pick an alternative.',
        verifyUrl: verifyHoursUrl(act), dayIndex, actIds: [act.id],
      });
    } else if (act.businessStatus === 'CLOSED_TEMPORARILY') {
      warnings.push({
        type: 'closed_temporarily', severity: 'warning', icon: '⛔',
        title: 'May be temporarily closed',
        message: `"${act.name}" is marked temporarily closed — confirm it's reopened.`,
        hint: 'Check the venue’s current status.',
        verifyUrl: verifyHoursUrl(act), dayIndex, actIds: [act.id],
      });
    }
  });

  // ── Rule 13b: Scheduled outside opening hours ──
  // The weekly hours are a snapshot of the season we fetched in, so confidence varies:
  //   · seasonal-prone venue  → never red; soft "verify hours for your dates" tip
  //     (the snapshot can't see the trip's season — a false "closed" is the worst error)
  //   · closed that whole weekday, non-seasonal → red error (season-robust, provable)
  //   · open that day but scheduled outside the window → amber warning
  // Unknown hours stay silent (isOpenAt → null).
  const venueWd = weekdayOf(day.date);
  timeline.forEach(({ act, startMin }) => {
    if (act.type !== 'activity' && act.type !== 'food') return;
    if (act.businessStatus === 'CLOSED_PERMANENTLY' || act.businessStatus === 'CLOSED_TEMPORARILY') return; // 13a covers it
    if (isOpenAt(act.openHours, venueWd, startMin) !== false) return; // open / unknown
    const lbl = hoursLabel(act.openHours, venueWd);
    const darkDay = !(lbl && lbl !== 'Closed');   // closed that whole weekday (no intervals)
    const seasonal = SEASONAL_RE.test(`${act.name || ''} ${act.detail || ''}`);

    let warning;
    if (seasonal) {
      warning = {
        severity: 'info', icon: '🗓️', title: 'Verify hours for your dates',
        message: `"${act.name}" may keep seasonal hours — the times we have are a snapshot and might not match your travel dates.`,
        hint: 'Tap to check the venue’s current hours.',
      };
    } else if (darkDay) {
      warning = {
        severity: 'error', icon: '🔒', title: 'Closed that day',
        message: `"${act.name}" looks closed that day.`,
        hint: 'Move it to a day it’s open, or check the venue’s hours.',
      };
    } else {
      warning = {
        severity: 'warning', icon: '🕐', title: 'Outside opening hours',
        message: `"${act.name}" is at ${act.time}, but it’s open ${lbl} that day.`,
        hint: 'Shift it into the open window, or double-check.',
      };
    }
    warnings.push({ type: 'closed_venue', ...warning, verifyUrl: verifyHoursUrl(act), dayIndex, actIds: [act.id] });
  });

  return warnings;
}

/** Formats minutes-since-midnight as "HH:MM". */
function formatEndTime(totalMin) {
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Trip-level validation ────────────────────────────────────────

/**
 * Main entry point. Validates every day in the trip and adds
 * trip-level rules. Returns an array of warning objects.
 */
export function validateTrip(trip) {
  const warnings = [];

  trip.days.forEach((day, i) => {
    warnings.push(...validateDay(day, i, trip.families || []));
  });

  // ── Trip rule: empty or near-empty days ──────────────────────────
  const isLongTrip = trip.days.length >= 7;

  trip.days.forEach((day, i) => {
    const isEdge     = i === 0 || i === trip.days.length - 1;
    const nonSkipped = day.activities.filter(a => a.status !== 'skipped');
    const realActs   = nonSkipped.filter(a => a.type !== 'note');

    if (nonSkipped.length === 0) {
      warnings.push({
        type:     'empty_day',
        severity: isEdge ? 'info' : 'warning',
        icon:     '📅',
        title:    'No activities planned',
        message:  `${day.label} (${day.date}) has nothing planned.${isLongTrip ? ' On longer trips the AI planner can miss a day.' : ''}`,
        hint:     isEdge
          ? 'Add arrival/departure transport, hotel check-in, or any planned activities.'
          : 'Add activities or insert a rest-day note so the group knows what to expect.',
        dayIndex: i,
      });
    } else if (realActs.length === 0) {
      warnings.push({
        type:     'notes_only_day',
        severity: 'info',
        icon:     '📝',
        title:    'Notes only — no activities',
        message:  `${day.label} (${day.date}) has notes but no planned activities or transport.`,
        hint:     'Add meals, transport, or experiences to this day.',
        dayIndex: i,
      });
    }
  });

  // ── Trip rule: nights without a place to sleep ───────────────────
  // Every night needs lodging EXCEPT the last day (you head home) or an overnight
  // journey (lodgingForNight returns {overnightTransit}, so it's not null → not
  // flagged). This fires even when the trip has NO stay at all — a multi-day trip
  // with zero lodging is the MOST important case to flag, not the one to stay silent
  // on. Home-base trips opt out via trip.homeBase; empty days are already covered by
  // empty_day, so we skip them here to avoid double-warning.
  const hasAnyStay = trip.days.some(d =>
    d.activities.some(a => a.type === 'stay' && a.status !== 'skipped'));
  if (!trip.homeBase && trip.days.length >= 2) {
    for (let i = 0; i < trip.days.length - 1; i++) {   // every night but the last day
      const day = trip.days[i];
      if (day.activities.filter(a => a.status !== 'skipped').length === 0) continue; // empty_day covers it
      if (lodgingForNight(trip, i) === null) {
        warnings.push({
          type:     'unbooked_night',
          severity: 'warning',
          icon:     '🛏️',
          title:    'No place to stay that night',
          message:  `No accommodation is booked for the night of ${day.label} (${day.date}).`,
          hint:     'Add a hotel check-in (set its nights), or mark it as an overnight journey or a stay at home.',
          dayIndex: i,
        });
      }
    }
  }

  // ── Trip rule: last day has no check-out / way home ──────────────
  const lastIdx = trip.days.length - 1;
  if (hasAnyStay && lastIdx >= 1) {
    const lastDay     = trip.days[lastIdx];
    const lastActs    = lastDay.activities.filter(a => a.status !== 'skipped');
    const hasDeparture = lastActs.some(a => a.type === 'transport');
    if (lastActs.length > 0 && !hasDeparture) {
      warnings.push({
        type:     'lastday_missing_checkout',
        severity: 'info',
        icon:     '🧳',
        title:    'No way home planned',
        message:  `${lastDay.label} (${lastDay.date}) is your last day but has no check-out or trip home.`,
        hint:     'Add your hotel check-out and the journey home (flight, train, or drive).',
        dayIndex: lastIdx,
      });
    }
  }

  // ── Trip rule: long journey days ─────────────────────────────────
  // Transport activities >= 6h with other activities on the same day.
  // Each other activity gets a per-activity "Move to Day N" suggestion.
  trip.days.forEach((day, i) => {
    const nonSkipped = day.activities.filter(a => a.status !== 'skipped');

    const longJourneys = nonSkipped.filter(a =>
      a.type === 'transport' && estimateDuration(a) >= 360
    );

    longJourneys.forEach(journey => {
      const others = nonSkipped.filter(a =>
        a.id !== journey.id && a.type !== 'note'
      );
      if (others.length === 0) return;

      const nextDay = trip.days[i + 1] || null;
      const prevDay = trip.days[i - 1] || null;

      const impactedActivities = others.map(a => {
        const targetDay = nextDay || prevDay;
        return {
          id:                a.id,
          name:              a.name,
          time:              a.time,
          suggestedDayIndex: targetDay ? (nextDay ? i + 1 : i - 1) : null,
          suggestedDayLabel: targetDay?.label || null,
        };
      });

      warnings.push({
        type:               'long_journey_conflict',
        severity:           'error',
        icon:               '✈️',
        title:              'Long journey — other activities affected',
        message:            `"${journey.name}" takes ${formatDuration(estimateDuration(journey))}. The ${others.length} other activit${others.length === 1 ? 'y' : 'ies'} on this day may not be reachable.`,
        hint:               nextDay
          ? `Move the other activities to ${nextDay.label}.`
          : prevDay
            ? `Move the other activities to ${prevDay.label}.`
            : 'Consider spreading activities across adjacent days.',
        impactedActivities,
        dayIndex:           i,
        actIds:             [journey.id, ...others.map(a => a.id)],
      });
    });
  });

  return warnings;
}

/** Groups warnings by dayIndex for display. */
export function groupWarningsByDay(warnings, trip) {
  const byDay = {};
  warnings.forEach(w => {
    const key = w.dayIndex ?? 'trip';
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(w);
  });
  return byDay;
}

/** Returns { errors, warnings, infos } counts. */
export function summariseWarnings(warnings) {
  return {
    errors:   warnings.filter(w => w.severity === 'error').length,
    warnings: warnings.filter(w => w.severity === 'warning').length,
    infos:    warnings.filter(w => w.severity === 'info').length,
  };
}
