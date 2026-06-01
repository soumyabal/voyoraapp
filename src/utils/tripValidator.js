/**
 * tripValidator.js
 *
 * Intelligent trip validation engine.
 *
 * Given a trip's day-by-day itinerary, produces a list of warnings
 * with severity levels: 'error' | 'warning' | 'info'
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
 */

// ─── Duration estimation ──────────────────────────────────────────

/**
 * Returns estimated duration in minutes for a given activity.
 * Uses keyword matching on name + detail fields.
 */
export function estimateDuration(activity) {
  const name   = (activity.name   || '').toLowerCase();
  const detail = (activity.detail || '').toLowerCase();
  const text   = `${name} ${detail}`;

  // ── Transport ────────────────────────────────────────────────────
  if (activity.type === 'transport') {
    switch (activity.subtype) {
      case 'flight': return 180;  // flight + 2h airport buffer
      case 'car':    return 120;  // default drive
      case 'train':  return 90;
      case 'ship':   return 240;
      default:       return 120;
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

// ─── Per-day validation ───────────────────────────────────────────

function validateDay(day, dayIndex) {
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
        type:     'overlap',
        severity: overlapMin >= 90 ? 'error' : 'warning',
        icon:     '⏱',
        title:    'Schedule overlap',
        message:  `"${curr.act.name}" typically takes ${formatDuration(curr.duration)}, overlapping with "${next.act.name}" by ~${overlapMin} min.`,
        hint:     `Consider moving "${next.act.name}" to ${formatEndTime(curr.endMin)} or later.`,
        dayIndex,
        actIds:   [curr.act.id, next.act.id],
      });
    }
  }

  // ── Rule 2: Full-day venue with too many other activities ─────────
  const fullDayItems = timeline.filter(t => t.duration >= 360);
  fullDayItems.forEach(({ act }) => {
    const others = acts.filter(a => a.id !== act.id && a.type !== 'note' && a.type !== 'food');
    if (others.length >= 2) {
      warnings.push({
        type:     'full_day_conflict',
        severity: 'warning',
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
      severity: 'warning',
      icon:     '😓',
      title:    'Very packed day',
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
    warnings.push(...validateDay(day, i));
  });

  // ── Trip rule: empty or near-empty days ──────────────────────────
  // Checks ALL days (not just middle ones). Common on long trips where
  // the AI planner skips a day entirely.
  const isLongTrip = trip.days.length >= 7;

  trip.days.forEach((day, i) => {
    const isEdge = i === 0 || i === trip.days.length - 1;
    const nonSkipped = day.activities.filter(a => a.status !== 'skipped');
    const realActs   = nonSkipped.filter(a => a.type !== 'note');

    if (nonSkipped.length === 0) {
      // Completely empty day — warning for middle days, info for arrival/departure
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
      // Has only notes — no real activities scheduled
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
