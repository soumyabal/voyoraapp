/**
 * pipeline.js — Voyara Multi-Agent Orchestrator
 *
 * Phase 1 architecture (client-side, no backend):
 *
 *   POST /api/plan  →  [this file]
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  1. FamilyProfileAgent  (SEQUENTIAL · no API)           │
 *   │     Builds GroupProfile from all families + travelers   │
 *   │                         ↓                               │
 *   │  2. ──────── PARALLEL Promise.all ────────────────────  │
 *   │     StayAgent       ExperienceAgent     TransitAgent    │
 *   │     (mock/Places)   (mock/Places+Viator)(mock/Maps)     │
 *   │                         ↓                               │
 *   │  3. FamilyBudgetAgent  (SEQUENTIAL · pure JS)           │
 *   │     Per-family expense breakdown → Expense[]            │
 *   │                         ↓                               │
 *   │  4. ItineraryAgent     (SEQUENTIAL · Claude haiku)      │
 *   │     Synthesises all outputs → Activity[][]              │
 *   └─────────────────────────────────────────────────────────┘
 *
 * Phase 2: wrap in Cloudflare Worker, move CLAUDE_API_KEY server-side.
 *
 * Returns:
 *   {
 *     dayActivities:   Activity[][]   ← write to Zustand store
 *     budgetByFamily:  FamilyBudget[] ← optional display in UI
 *     expenses:        Expense[]      ← push to Splitwise tab
 *     groupProfile:    GroupProfile   ← for downstream chat context
 *     meta:            { agentsRun, durationMs, usedFallback }
 *   }
 */

import * as FamilyProfileAgent from './FamilyProfileAgent';
import * as StayAgent          from './StayAgent';
import * as ExperienceAgent    from './ExperienceAgent';
import * as TransitAgent       from './TransitAgent';
import * as FamilyBudgetAgent  from './FamilyBudgetAgent';
import * as ItineraryAgent     from './ItineraryAgent';

/**
 * runPipeline(trip, travelers, options, onProgress, fallback, onAgentEvent)
 *
 * @param {object}   trip          — Voyara trip object
 * @param {array}    travelers     — global traveler library
 * @param {object}   options       — { notes, pace, budget, focus }
 * @param {function} onProgress    — (message: string) => void
 * @param {function} fallback      — async fn(trip, travelers, options, onProgress) → Activity[][]
 * @param {function} onAgentEvent  — (agentName, status, data) => void
 *                                   status: 'running' | 'done' | 'error'
 *                                   data: agent-specific result summary for UI
 *
 * @returns {PipelineResult}
 */
export async function runPipeline(trip, travelers, options, onProgress, fallback, onAgentEvent) {
  const t0 = Date.now();
  const agentsRun = [];

  try {
    // ── Stage 1: FamilyProfileAgent ──────────────────────────────────────────
    onProgress?.('👨‍👩‍👧 Analysing your group…');
    onAgentEvent?.('FamilyProfileAgent', 'running', null);
    const groupProfile = FamilyProfileAgent.run(trip, travelers);
    agentsRun.push('FamilyProfileAgent');
    onAgentEvent?.('FamilyProfileAgent', 'done', {
      totalMembers:  groupProfile.totalMembers,
      totalFamilies: groupProfile.totalFamilies,
      roomsNeeded:   groupProfile.totalRoomsNeeded,
      flags:         groupProfile.flags.slice(0, 2),
      summary:       `${groupProfile.totalMembers} travellers · ${groupProfile.totalRoomsNeeded} room${groupProfile.totalRoomsNeeded !== 1 ? 's' : ''} needed`,
    });

    // ── Stage 2: Parallel agents ─────────────────────────────────────────────
    onProgress?.('🔍 Finding hotels, activities, and transport…');
    const nights = trip.days?.length || 3;

    // Fire running events immediately (they start simultaneously)
    onAgentEvent?.('StayAgent',       'running', null);
    onAgentEvent?.('ExperienceAgent', 'running', null);
    onAgentEvent?.('TransitAgent',    'running', null);

    const [stayResults, experiences, transitResult] = await Promise.all([
      StayAgent.run(groupProfile, trip.destination, nights)
        .then(r => {
          agentsRun.push('StayAgent');
          const top = r[0];
          onAgentEvent?.('StayAgent', 'done', {
            hotel:    top ? { name: top.name, pricePerRoom: top.pricePerRoom, amenities: (top.amenities || []).slice(0, 3), fitReasons: (top.fitReasons || []).slice(0, 2) } : null,
            count:    r.length,
            summary:  top ? `${top.name} · $${top.pricePerRoom}/room` : `${r.length} hotels found`,
          });
          return r;
        }),
      ExperienceAgent.run(groupProfile, trip.destination, nights)
        .then(r => {
          agentsRun.push('ExperienceAgent');
          onAgentEvent?.('ExperienceAgent', 'done', {
            topExperiences: r.slice(0, 4).map(e => ({ name: e.name, cost: e.cost, tags: (e.tags || []).slice(0, 2) })),
            count:   r.length,
            summary: `${r.length} experiences ranked · top: ${r[0]?.name || 'local activities'}`,
          });
          return r;
        }),
      TransitAgent.run(groupProfile, trip, options.notes || '')
        .then(r => {
          agentsRun.push('TransitAgent');
          onAgentEvent?.('TransitAgent', 'done', {
            localTransport: r.local?.recommended || 'Local transport',
            multiCity:      r.multiCity ? r.multiCity.map(l => l.city).join(' → ') : null,
            summary:        r.local?.recommended || 'Routes mapped',
          });
          return r;
        }),
    ]);

    onProgress?.('🏨 Hotels found · 🎯 Activities scored · 🚌 Transit mapped');

    // ── Stage 3: FamilyBudgetAgent ────────────────────────────────────────────
    onProgress?.('💰 Computing per-family budget breakdown…');
    onAgentEvent?.('FamilyBudgetAgent', 'running', null);

    const preliminaryDayActivities = buildPreliminaryActivities(trip, stayResults, experiences, transitResult, groupProfile);
    const budgetPreview = FamilyBudgetAgent.run(trip, preliminaryDayActivities, groupProfile);
    agentsRun.push('FamilyBudgetAgent (preview)');
    onAgentEvent?.('FamilyBudgetAgent', 'done', {
      budgetByFamily: budgetPreview.budgetByFamily,
      totalBudget:    budgetPreview.totalBudget,
      summary:        `$${budgetPreview.totalBudget.toLocaleString()} total · ${budgetPreview.budgetByFamily.length} famil${budgetPreview.budgetByFamily.length !== 1 ? 'ies' : 'y'}`,
    });

    // ── Stage 4: ItineraryAgent ───────────────────────────────────────────────
    onProgress?.('✨ Building your personalised itinerary…');
    onAgentEvent?.('ItineraryAgent', 'running', null);
    let dayActivities = await ItineraryAgent.run(
      trip, travelers, options, groupProfile,
      stayResults, experiences, transitResult,
      onProgress,
    );
    agentsRun.push('ItineraryAgent');

    let usedFallback = false;
    if (!dayActivities) {
      onProgress?.('Using smart planner…');
      dayActivities = await fallback(trip, travelers, options, onProgress);
      usedFallback = true;
    }

    const activityCount = (dayActivities || []).flatMap(d => d).length;
    onAgentEvent?.('ItineraryAgent', 'done', {
      activityCount,
      days: trip.days?.length || 0,
      summary: `${activityCount} activities across ${trip.days?.length || 0} days`,
    });

    // ── Stage 3b: FinalBudget ──────────────────────────────────────────────────
    onProgress?.('💰 Finalising per-family expense breakdown…');
    const budgetResult = FamilyBudgetAgent.run(trip, dayActivities, groupProfile);
    agentsRun.push('FamilyBudgetAgent (final)');

    const durationMs = Date.now() - t0;
    onProgress?.(`✅ Plan ready · ${agentsRun.length} agents · ${(durationMs / 1000).toFixed(1)}s`);

    return {
      dayActivities,
      budgetByFamily:  budgetResult.budgetByFamily,
      expenses:        budgetResult.expenses,
      groupProfile,
      // Intermediate results for review UI
      stayResults:     stayResults.slice(0, 3),
      topExperiences:  experiences.slice(0, 6),
      transitResult,
      meta: {
        agentsRun,
        durationMs,
        usedFallback,
        totalBudget:    budgetResult.totalBudget,
        hotelUsed:      stayResults[0]?.name || null,
        topExperiences: experiences.slice(0, 3).map(e => e.name),
      },
    };

  } catch (err) {
    console.error('[pipeline] Error:', err);
    onProgress?.('Falling back to smart planner…');
    // Mark any still-pending agents as error
    ['FamilyProfileAgent','StayAgent','ExperienceAgent','TransitAgent','FamilyBudgetAgent','ItineraryAgent']
      .forEach(name => onAgentEvent?.(name, 'error', { error: err.message }));

    const dayActivities  = await fallback(trip, travelers, options, onProgress);
    const groupProfile   = FamilyProfileAgent.run(trip, travelers);
    const budgetResult   = FamilyBudgetAgent.run(trip, dayActivities, groupProfile);

    return {
      dayActivities,
      budgetByFamily:  budgetResult.budgetByFamily,
      expenses:        budgetResult.expenses,
      groupProfile,
      stayResults:     [],
      topExperiences:  [],
      transitResult:   null,
      meta: { agentsRun, durationMs: Date.now() - t0, usedFallback: true, error: err.message },
    };
  }
}

// ─── Preliminary activity builder ────────────────────────────────────────────
// Creates a rough skeleton of activities from agent data so FamilyBudgetAgent
// can produce a budget preview before ItineraryAgent finishes.

function buildPreliminaryActivities(trip, stayResults, experiences, transitResult, groupProfile) {
  const hotel     = stayResults?.[0];
  const nights    = trip.days?.length || 3;
  const roomCost  = hotel
    ? Math.round((hotel.pricePerRoom * groupProfile.totalRoomsNeeded) / groupProfile.totalMembers)
    : 100;

  return (trip.days || []).map((day, i) => {
    const acts = [];

    // Accommodation on each night
    if (hotel) {
      acts.push({ type: 'stay', costPerPerson: roomCost, name: hotel.name, id: `prelim-stay-${i}` });
    }

    // Sample 2 experiences per day from the scored list
    const expSlice = (experiences || []).slice(i * 2, i * 2 + 2);
    expSlice.forEach(exp => {
      acts.push({ type: 'activity', costPerPerson: exp.cost || 0, name: exp.name, id: `prelim-exp-${i}-${exp.name}` });
    });

    // Meals estimate
    const budgetMeals = { budget: 40, 'mid-range': 65, luxury: 110 }[groupProfile.budget] || 65;
    acts.push({ type: 'food', costPerPerson: budgetMeals, name: 'Meals', id: `prelim-food-${i}` });

    return acts;
  });
}
