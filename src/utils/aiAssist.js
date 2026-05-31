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
 * analyzeItinerary(trip, profiles)
 * Returns Suggestion[] — sorted by severity (error > warning > info).
 * profiles is the global profiles array from the store.
 */
export function analyzeItinerary(trip, profiles = []) {
  const suggestions = [];
  const allMembers = trip.families.flatMap(f => f.members);

  // Build a map profileId → profile for quick lookup
  const profileMap = {};
  profiles.forEach(p => { profileMap[p.id] = p; });

  // Enrich members with profile data where linked
  const enrichedMembers = allMembers.map(m => {
    const profile = m.profileId ? profileMap[m.profileId] : null;
    return { ...m, profile };
  });

  // ── 1. Check for missing meal slots per day ──────────────────────────────
  trip.days.forEach((day, i) => {
    const acts = day.activities;
    if (acts.length === 0) return; // blank day handled below

    MEAL_WINDOWS.forEach(meal => {
      if (!dayHasMealType(acts, meal.label)) {
        suggestions.push({
          id: `meal-${i}-${meal.label}`,
          type: 'gap',
          severity: meal.label === 'dinner' ? 'warning' : 'info',
          day: i,
          icon: meal.label === 'breakfast' ? '☕' : meal.label === 'lunch' ? '🥗' : '🍽️',
          title: `Missing ${meal.label} on ${day.label}`,
          body: `No ${meal.label} activity is scheduled. Consider adding a food entry in the ${meal.label} time window.`,
        });
      }
    });

    // ── 2. Large unplanned gap (>3 hours between activities) ──────────────
    const gap = largestGapMinutes(acts);
    if (gap > 180 && acts.length >= 2) {
      suggestions.push({
        id: `gap-${i}`,
        type: 'gap',
        severity: 'info',
        day: i,
        icon: '⏳',
        title: `Long unplanned gap on ${day.label}`,
        body: `There's a ${Math.round(gap / 60)}h gap between activities. You might want to add something or leave it as free time.`,
      });
    }
  });

  // ── 3. Blank days ────────────────────────────────────────────────────────
  trip.days.forEach((day, i) => {
    if (day.activities.length === 0) {
      suggestions.push({
        id: `blank-${i}`,
        type: 'gap',
        severity: 'warning',
        day: i,
        icon: '📅',
        title: `${day.label} has no activities`,
        body: 'Nothing is planned for this day. Add activities or mark it as a rest day.',
      });
    }
  });

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
  const wheelchairMembers = enrichedMembers.filter(m =>
    (m.needs || []).some(n => n.toLowerCase().includes('wheelchair') || n.toLowerCase().includes('mobility'))
    || (m.profile?.needs || []).some(n => n.toLowerCase().includes('wheelchair') || n.toLowerCase().includes('mobility'))
  );

  if (wheelchairMembers.length > 0) {
    trip.days.forEach((day, i) => {
      day.activities.forEach(act => {
        if (act.type === 'activity' && !act.access) {
          const names = wheelchairMembers.map(m => m.name).join(', ');
          suggestions.push({
            id: `access-${act.id}`,
            type: 'needs',
            severity: 'warning',
            day: i,
            icon: '♿',
            title: `Accessibility check: "${act.name}"`,
            body: `${names} need${wheelchairMembers.length === 1 ? 's' : ''} mobility access but this activity has no accessibility note. Verify it's accessible before booking.`,
          });
        }
      });
    });
  }

  // ── 7. Dietary needs with no food activities noted ───────────────────────
  const dietaryMembers = enrichedMembers.filter(m =>
    (m.needs || []).some(n => n.toLowerCase().includes('dietary'))
    || (m.profile?.dietary || []).length > 0
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
    || (m.profile?.pacePreference === 'relaxed')
  );
  if (vulnerableMembers.length > 0) {
    trip.days.forEach((day, i) => {
      const actCount = day.activities.length;
      if (actCount >= 5) {
        suggestions.push({
          id: `pace-${i}`,
          type: 'pace',
          severity: 'info',
          day: i,
          icon: '🧓',
          title: `Busy day — check pace for ${vulnerableMembers[0].name}`,
          body: `${day.label} has ${actCount} activities. Travelers who prefer a relaxed pace may find this tiring. Consider building in a rest slot.`,
        });
      }
    });
  }

  // ── 9. Cost heavily concentrated on one day ──────────────────────────────
  const dayCosts = trip.days.map(d =>
    d.activities.reduce((sum, a) => sum + (a.costPerPerson || 0), 0)
  );
  const totalCost = dayCosts.reduce((s, c) => s + c, 0);
  if (totalCost > 0) {
    dayCosts.forEach((cost, i) => {
      if (cost / totalCost > 0.6 && trip.days.length > 2) {
        suggestions.push({
          id: `cost-concentration-${i}`,
          type: 'cost',
          severity: 'info',
          day: i,
          icon: '💰',
          title: `60%+ of budget concentrated on ${trip.days[i].label}`,
          body: `Most of the estimated spend is on one day. Consider spreading costs across the trip or review if this is intentional.`,
        });
      }
    });
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
export function buildTripContext(trip, profiles = []) {
  const profileMap = {};
  profiles.forEach(p => { profileMap[p.id] = p; });

  const allMembers = trip.families.flatMap(f =>
    f.members.map(m => ({ ...m, familyName: f.name, profile: m.profileId ? profileMap[m.profileId] : null }))
  );

  const days = trip.days.length;
  const start = trip.startDate;
  const end = trip.endDate;

  // Format travelers with profile enrichment
  const travelerLines = allMembers.map(m => {
    const parts = [`${m.name} (${m.age}yo, ${m.familyName})`];
    const needs = [
      ...(m.needs || []),
      ...(m.profile?.needs || []).filter(n => !(m.needs || []).includes(n)),
    ];
    if (needs.length) parts.push(`needs: ${needs.join(', ')}`);
    if (m.profile?.dietary?.length) parts.push(`dietary: ${m.profile.dietary.join(', ')}`);
    if (m.profile?.interests?.length) parts.push(`interests: ${m.profile.interests.join(', ')}`);
    if (m.profile?.pacePreference) parts.push(`pace: ${m.profile.pacePreference}`);
    if (m.profile?.notes) parts.push(`note: ${m.profile.notes}`);
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

export function suggestionCount(trip, profiles) {
  return analyzeItinerary(trip, profiles).filter(s => s.severity !== 'info').length;
}

export function suggestionsByDay(trip, profiles) {
  const all = analyzeItinerary(trip, profiles);
  const map = {};
  all.forEach(s => {
    const key = s.day !== undefined ? s.day : 'global';
    if (!map[key]) map[key] = [];
    map[key].push(s);
  });
  return map;
}
