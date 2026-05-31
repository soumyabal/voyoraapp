/**
 * aiAssist.js
 *
 * Two-layer AI assistance system for Voyara:
 *
 * Layer 1 — analyzeItinerary()
 *   Rule-based, runs locally, zero API cost.
 *   Returns an array of Suggestion objects instantly.
 *
 * Layer 2 — buildTripContext()
 *   Formats the full trip + traveler profiles into a system prompt string
 *   ready to send to Claude (or any LLM) for chat and deep review.
 */

import { effectiveMember } from './helpers';

// ─── Types ────────────────────────────────────────────────────────────────────
// Suggestion: { id, type, severity, day (optional), title, body, icon }
// severity: 'info' | 'warning' | 'error'
// type: 'gap' | 'needs' | 'cost' | 'missing_category' | 'pace'

// ─── Layer 1: Rule-based gap & needs detection ────────────────────────────────

const MEAL_WINDOWS = [
  { label: 'breakfast', start: 6, end: 10 },
  { label: 'lunch',     start: 11, end: 14 },
  { label: 'dinner',    start: 18, end: 21 },
];

function toMinutes(time) {
  if (!time) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

function dayHasMealType(activities, label) {
  const window = MEAL_WINDOWS.find(w => w.label === label);
  if (!window) return true;
  return activities.some(a => {
    if (a.type !== 'food') return false;
    const mins = toMinutes(a.time);
    return mins >= window.start * 60 && mins <= window.end * 60;
  });
}

function largestGapMinutes(activities) {
  if (activities.length < 2) return 0;
  const sorted = [...activities].sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = toMinutes(sorted[i].time) - toMinutes(sorted[i - 1].time);
    if (gap > maxGap) maxGap = gap;
  }
  return maxGap;
}

/**
 * analyzeItinerary(trip, travelers)
 * Returns Suggestion[] — sorted by severity (error > warning > info).
 * travelers is the global travelers array from the store.
 */
export function analyzeItinerary(trip, travelers = []) {
  const suggestions = [];
  const allMembers = trip.families.flatMap(f => f.members);

  // Enrich members using effectiveMember merge (trip overrides ?? traveler defaults)
  const enrichedMembers = allMembers.map(m => effectiveMember(m, travelers));

  // ── 1. Missing meals — grouped by meal type across all days ─────────────
  MEAL_WINDOWS.forEach(meal => {
    const icon = meal.label === 'breakfast' ? '☕' : meal.label === 'lunch' ? '🥗' : '🍽️';
    const missingDayIndices = trip.days.reduce((acc, day, i) => {
      if (day.activities.length === 0) return acc; // blank days handled separately
      if (!dayHasMealType(day.activities, meal.label)) acc.push(i);
      return acc;
    }, []);
    if (missingDayIndices.length === 0) return;

    const dayLabels = missingDayIndices.map(i => trip.days[i]?.label || `Day ${i + 1}`);
    const preview = dayLabels.slice(0, 4).join(', ') + (dayLabels.length > 4 ? ` +${dayLabels.length - 4} more` : '');

    suggestions.push({
      id: `meal-${meal.label}`,
      type: 'gap',
      severity: meal.label === 'dinner' ? 'warning' : 'info',
      day: missingDayIndices[0],
      days: missingDayIndices,
      icon,
      title: missingDayIndices.length === 1
        ? `No ${meal.label} on ${dayLabels[0]}`
        : `No ${meal.label} on ${missingDayIndices.length} days`,
      body: `${preview}. Add a food activity in the ${meal.label} time window (${meal.start}:00–${meal.end}:00).`,
    });
  });

  // ── 2. Large unplanned gaps — grouped ────────────────────────────────────
  const gapDays = [];
  trip.days.forEach((day, i) => {
    const acts = day.activities;
    if (acts.length < 2) return;
    const gap = largestGapMinutes(acts);
    if (gap > 180) gapDays.push({ i, gap, label: day.label });
  });
  if (gapDays.length === 1) {
    const { i, gap, label } = gapDays[0];
    suggestions.push({
      id: `gap-${i}`, type: 'gap', severity: 'info', day: i, days: [i], icon: '⏳',
      title: `Long unplanned gap on ${label}`,
      body: `${Math.round(gap / 60)}h between activities. Add something or leave it as free time.`,
    });
  } else if (gapDays.length > 1) {
    suggestions.push({
      id: 'gap-multiple', type: 'gap', severity: 'info',
      day: gapDays[0].i,
      days: gapDays.map(d => d.i),
      icon: '⏳',
      title: `Long gaps on ${gapDays.length} days`,
      body: gapDays.slice(0, 3).map(d => `${d.label} (${Math.round(d.gap / 60)}h)`).join(', ') +
        (gapDays.length > 3 ? ` +${gapDays.length - 3} more` : '') + '. Consider filling or marking as free time.',
    });
  }

  // ── 3. Blank days — single grouped suggestion ────────────────────────────
  const blankDayIndices = trip.days.reduce((acc, day, i) => {
    if (day.activities.length === 0) acc.push(i);
    return acc;
  }, []);
  if (blankDayIndices.length === 1) {
    const i = blankDayIndices[0];
    suggestions.push({
      id: `blank-${i}`, type: 'gap', severity: 'warning', day: i, days: [i], icon: '📅',
      title: `${trip.days[i].label} has no activities`,
      body: 'Nothing planned for this day. Add activities or mark it as a rest day.',
    });
  } else if (blankDayIndices.length > 1) {
    const labels = blankDayIndices.map(i => trip.days[i]?.label || `Day ${i + 1}`);
    suggestions.push({
      id: 'blank-multiple', type: 'gap',
      severity: blankDayIndices.length > 2 ? 'warning' : 'info',
      day: blankDayIndices[0],
      days: blankDayIndices,
      icon: '📅',
      title: `${blankDayIndices.length} days have no activities`,
      body: labels.slice(0, 4).join(', ') + (labels.length > 4 ? ` +${labels.length - 4} more` : '') +
        ' — add activities or mark as rest days.',
    });
  }

  // ── 4. No accommodation activity in the whole trip ───────────────────────
  const hasStay = trip.days.some(d => d.activities.some(a => a.type === 'stay'));
  if (!hasStay && trip.days.length > 0) {
    suggestions.push({
      id: 'no-accommodation',
      type: 'missing_category',
      severity: 'warning',
      icon: '🏨',
      title: 'No accommodation entries',
      body: 'The itinerary has no hotel check-in or stay activity. Add one on Day 1 so Splitwise costs reflect accommodation.',
    });
  }

  // ── 5. No transport on Day 1 ─────────────────────────────────────────────
  const day1 = trip.days[0];
  if (day1 && day1.activities.length > 0) {
    const hasTransport = day1.activities.some(a => a.type === 'transport');
    if (!hasTransport) {
      suggestions.push({
        id: 'no-day1-transport',
        type: 'missing_category',
        severity: 'info',
        day: 0,
        icon: '✈️',
        title: 'No arrival transport on Day 1',
        body: 'Consider adding an airport transfer or arrival transport on the first day.',
      });
    }
  }

  // ── 6. Special needs vs activity access notes ────────────────────────────
  // enrichedMembers already has merged needs via effectiveMember
  const wheelchairMembers = enrichedMembers.filter(m =>
    (m.needs || []).some(n => n.toLowerCase().includes('wheelchair') || n.toLowerCase().includes('mobility'))
  );

  if (wheelchairMembers.length > 0) {
    const unverified = [];
    trip.days.forEach((day, i) => {
      day.activities.forEach(act => {
        if (act.type === 'activity' && !act.access) unverified.push({ name: act.name, day: i, label: day.label });
      });
    });
    if (unverified.length > 0) {
      const names = wheelchairMembers.map(m => m.name).join(', ');
      const preview = unverified.slice(0, 3).map(a => `"${a.name}"`).join(', ') +
        (unverified.length > 3 ? ` +${unverified.length - 3} more` : '');
      suggestions.push({
        id: 'access-unchecked',
        type: 'needs',
        severity: 'warning',
        day: unverified[0].day,
        days: [...new Set(unverified.map(a => a.day))],
        icon: '♿',
        title: `${unverified.length} activit${unverified.length === 1 ? 'y needs' : 'ies need'} accessibility check`,
        body: `${names} need${wheelchairMembers.length === 1 ? 's' : ''} mobility access. Unverified: ${preview}.`,
      });
    }
  }

  // ── 7. Dietary needs with no food activities noted ───────────────────────
  const dietaryMembers = enrichedMembers.filter(m =>
    (m.needs || []).some(n => n.toLowerCase().includes('dietary'))
    || (m.dietary || []).length > 0
  );
  if (dietaryMembers.length > 0) {
    const hasFoodDetail = trip.days.some(d =>
      d.activities.some(a => a.type === 'food' && a.detail && a.detail.length > 5)
    );
    if (!hasFoodDetail) {
      const names = dietaryMembers.map(m => m.name).join(', ');
      suggestions.push({
        id: 'dietary-no-notes',
        type: 'needs',
        severity: 'info',
        icon: '🌿',
        title: 'Dietary needs — no food details noted',
        body: `${names} ha${dietaryMembers.length === 1 ? 's' : 've'} dietary requirements. Consider adding details to food activities to confirm options are suitable.`,
      });
    }
  }

  // ── 8. Infant/elderly pace check ────────────────────────────────────────
  const vulnerableMembers = enrichedMembers.filter(m =>
    (m.needs || []).some(n => n.toLowerCase().includes('infant') || n.toLowerCase().includes('elderly'))
    || (m.age && m.age >= 75)
    || m.pacePreference === 'relaxed'
  );
  if (vulnerableMembers.length > 0) {
    const busyDays = trip.days.reduce((acc, day, i) => {
      if (day.activities.length >= 5) acc.push({ i, count: day.activities.length, label: day.label });
      return acc;
    }, []);
    if (busyDays.length === 1) {
      const { i, count, label } = busyDays[0];
      suggestions.push({
        id: `pace-${i}`, type: 'pace', severity: 'info', day: i, days: [i], icon: '🧓',
        title: `Busy day — check pace for ${vulnerableMembers[0].name}`,
        body: `${label} has ${count} activities. Consider adding a rest slot for travelers who prefer a relaxed pace.`,
      });
    } else if (busyDays.length > 1) {
      suggestions.push({
        id: 'pace-multiple', type: 'pace', severity: 'info',
        day: busyDays[0].i,
        days: busyDays.map(d => d.i),
        icon: '🧓',
        title: `${busyDays.length} busy days — check pace for ${vulnerableMembers[0].name}`,
        body: busyDays.slice(0, 3).map(d => `${d.label} (${d.count} activities)`).join(', ') +
          (busyDays.length > 3 ? ` +${busyDays.length - 3} more` : '') + '. Consider rest slots.',
      });
    }
  }

  // ── 9. Cost heavily concentrated on one day ──────────────────────────────
  const dayCosts = trip.days.map(d =>
    d.activities.reduce((sum, a) => sum + (a.costPerPerson || 0), 0)
  );
  const totalCost = dayCosts.reduce((s, c) => s + c, 0);
  if (totalCost > 0 && trip.days.length > 2) {
    const concentrated = dayCosts
      .map((cost, i) => ({ i, cost, label: trip.days[i].label, pct: cost / totalCost }))
      .filter(d => d.pct > 0.6);
    if (concentrated.length > 0) {
      const d = concentrated[0];
      suggestions.push({
        id: `cost-concentration-${d.i}`,
        type: 'cost', severity: 'info',
        day: d.i, days: [d.i], icon: '💰',
        title: `${Math.round(d.pct * 100)}% of budget on ${d.label}`,
        body: `Most estimated spend is concentrated on one day. Review if intentional or spread costs across the trip.`,
      });
    }
  }

  // Sort: error first, then warning, then info
  const order = { error: 0, warning: 1, info: 2 };
  return suggestions.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ─── Layer 2: AI context builder for Claude chat ──────────────────────────────

/**
 * buildTripContext(trip, profiles)
 * Returns a system prompt string that gives Claude full trip awareness.
 * Send this as the system message, then stream user messages as conversation turns.
 */
export function buildTripContext(trip, travelers = []) {
  const allMembers = trip.families.flatMap(f =>
    f.members.map(m => ({ ...effectiveMember(m, travelers), familyName: f.name }))
  );

  const days = trip.days.length;
  const start = trip.startDate;
  const end = trip.endDate;

  // Format travelers with merged effective fields
  const travelerLines = allMembers.map(m => {
    const parts = [`${m.name} (${m.age}yo, ${m.familyName})`];
    if ((m.needs || []).length) parts.push(`needs: ${m.needs.join(', ')}`);
    if ((m.dietary || []).length) parts.push(`dietary: ${m.dietary.join(', ')}`);
    if ((m.interests || []).length) parts.push(`interests: ${m.interests.join(', ')}`);
    if (m.pacePreference && m.pacePreference !== 'moderate') parts.push(`pace: ${m.pacePreference}`);
    if (m.notes) parts.push(`note: ${m.notes}`);
    return '- ' + parts.join(' | ');
  }).join('\n');

  // Format itinerary
  const itineraryLines = trip.days.map(day => {
    if (day.activities.length === 0) return `${day.label} (${day.date}): [no activities planned]`;
    const acts = [...day.activities]
      .sort((a, b) => a.time.localeCompare(b.time))
      .map(a => `  ${a.time} ${a.name}${a.costPerPerson > 0 ? ` ($${a.costPerPerson}/person)` : ''}${a.access ? ` [♿ ${a.access}]` : ''}`)
      .join('\n');
    return `${day.label} (${day.date}):\n${acts}`;
  }).join('\n\n');

  const totalBudget = allMembers.length > 0
    ? trip.days.flatMap(d => d.activities).reduce((s, a) => s + (a.costPerPerson || 0) * allMembers.length, 0)
    : 0;

  return `You are an AI travel planning assistant embedded in the Voyara travel planning app.

## Trip: ${trip.name}
- Destination: ${trip.destination}
- Dates: ${start} to ${end} (${days} day${days !== 1 ? 's' : ''})
- Planning mode: ${trip.mode}
- Estimated total budget: $${totalBudget.toFixed(0)} across all travelers

## Travelers (${allMembers.length} people, ${trip.families.length} family group${trip.families.length !== 1 ? 's' : ''})
${travelerLines || '- No travelers added yet'}

## Current Itinerary
${itineraryLines || 'No itinerary planned yet.'}

## Your role
- Review this trip plan and suggest improvements when asked
- Be aware of each traveler's special needs, dietary requirements, interests, and pace preference
- Flag gaps in the itinerary (missing meals, empty evenings, no accommodation, no transport)
- Suggest activities appropriate to the destination and the travelers' profiles
- When a traveler has accessibility needs, always verify activities are suitable
- Keep suggestions practical and actionable — the user can tap to add them to the itinerary
- Be concise: lead with the key suggestion, then explain briefly
- Do not repeat information the user already knows from the itinerary above
- If the plan is good, say so — do not manufacture suggestions`;
}

// ─── Suggestion helpers ───────────────────────────────────────────────────────

export function suggestionCount(trip, travelers) {
  return analyzeItinerary(trip, travelers).filter(s => s.severity !== 'info').length;
}

export function suggestionsByDay(trip, travelers) {
  const all = analyzeItinerary(trip, travelers);
  const map = {};
  all.forEach(s => {
    const key = s.day !== undefined ? s.day : 'global';
    if (!map[key]) map[key] = [];
    map[key].push(s);
  });
  return map;
}
