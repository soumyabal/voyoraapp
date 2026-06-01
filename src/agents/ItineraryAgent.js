/**
 * ItineraryAgent.js
 *
 * SEQUENTIAL · Claude claude-haiku-4-5-20251001
 *
 * Synthesises all upstream agent outputs into a final Activity[][].
 * Receives:
 *   - groupProfile    (from FamilyProfileAgent)
 *   - stayResults     (from StayAgent)
 *   - experiences     (from ExperienceAgent)
 *   - transitResult   (from TransitAgent)
 *   - budgetResult    (from FamilyBudgetAgent — for cost context)
 *   - trip + options  (from app)
 *
 * Output: Activity[][] matching existing Voyara schema
 *   (same shape as plannerAPI produces — zero changes to screens needed)
 */

import { CLAUDE_API_KEY, CLAUDE_MODEL, CLAUDE_API_URL } from '../config';
import { uid } from '../utils/helpers';

// ─── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are Voyara's ItineraryAgent — an expert multi-family travel planner.

Your job is to synthesise hotel options, activities, and transit data into a day-by-day itinerary.

OUTPUT FORMAT — respond ONLY with valid JSON, nothing else:
[
  [
    {
      "type": "transport|stay|food|activity",
      "time": "HH:MM",
      "name": "Short venue/activity name",
      "detail": "2–3 sentence description with practical tips",
      "access": "Accessibility info or 'Accessible' if confirmed",
      "costPerPerson": 25,
      "address": "Full address or empty string",
      "url": "Official URL or empty string",
      "mapUrl": "Google Maps URL or empty string",
      "rating": "4.7 ⭐ or empty string",
      "note": "Practical tip, booking advice, or null"
    }
  ]
]

RULES:
- Each outer array item = one day. Return exactly N arrays for an N-day trip.
- Each day: 4–6 activities for moderate pace, 3–4 for relaxed, 6–7 for packed.
- Always include breakfast (07:30–09:00), lunch (12:00–13:30), dinner (19:00–20:30).
- Day 1: start with transport arrival + hotel check-in.
- Last day: end with hotel checkout + departure transport.
- Use the provided hotel data for stay activities — match the name, address, costPerPerson (rooms × rate ÷ total members).
- Use the provided experiences list — prioritise highest-scored ones.
- costPerPerson must be a NUMBER (not a string), 0 if free.
- Wheelchair accessible venues only if hasWheelchair is true in the group profile.
- Kid-friendly venues required if hasKids or hasInfants is true.
- Respond with ONLY the JSON array — no markdown, no explanation.`;
}

// ─── User prompt builder ───────────────────────────────────────────────────────

function buildUserPrompt(trip, options, groupProfile, stayResults, experiences, transitResult) {
  const days   = trip.days?.length || 3;
  const dest   = trip.destination || 'the destination';
  const budget = groupProfile.budget;
  const pace   = groupProfile.pace;

  const topHotel = stayResults?.[0];
  const hotelLine = topHotel
    ? `RECOMMENDED HOTEL: ${topHotel.name} — $${topHotel.pricePerRoom}/room/night, ${topHotel.roomsNeeded} rooms needed ($${topHotel.totalRoomCost}/night total). Address: ${topHotel.address || ''}. Amenities: ${(topHotel.amenities || []).join(', ')}.`
    : 'HOTEL: Use a mid-range family hotel appropriate for the destination.';

  const experienceLines = (experiences || []).slice(0, 10).map((e, i) =>
    `  ${i + 1}. ${e.name} — $${e.cost}/person, ${e.duration}h, ${e.tags?.join('/')}. ${e.note || ''}`
  ).join('\n');

  const transitLine = transitResult?.local
    ? `LOCAL TRANSPORT: ${transitResult.local.recommended}. ${transitResult.local.note}`
    : '';

  const multiCityLine = transitResult?.multiCity
    ? `MULTI-CITY: ${transitResult.multiCity.map(l => l.city).join(' → ')}`
    : '';

  const groupFlags = (groupProfile.flags || []).map(f => `  • ${f}`).join('\n');

  const notesLine = options.notes?.trim()
    ? `SPECIAL INSTRUCTIONS: ${options.notes}`
    : '';

  const focusLine = options.focus?.length
    ? `TRIP FOCUS: ${options.focus.join(', ')}`
    : '';

  return `Plan a ${days}-day ${pace} pace ${budget} trip to ${dest} for ${groupProfile.totalMembers} people in ${groupProfile.totalFamilies} group${groupProfile.totalFamilies > 1 ? 's' : ''}.

GROUP PROFILE:
${groupFlags || '  • Standard adult group'}

${hotelLine}

TOP EXPERIENCES (use these — prioritise by fit score):
${experienceLines || '  Use appropriate local experiences for the destination.'}

${transitLine}
${multiCityLine}
${focusLine}
${notesLine}

Return the complete ${days}-day itinerary as JSON only.`;
}

// ─── Response parser ───────────────────────────────────────────────────────────

function parseResponse(text, numDays) {
  if (!text) return null;
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return null;

    // Validate and normalise each day
    const result = [];
    for (let i = 0; i < numDays; i++) {
      const dayActs = Array.isArray(parsed[i]) ? parsed[i] : [];
      result.push(
        dayActs.map(a => ({
          id:           uid(),
          type:         a.type || 'activity',
          time:         a.time || '09:00',
          name:         a.name || 'Activity',
          detail:       a.detail || '',
          access:       a.access || '',
          costPerPerson: typeof a.costPerPerson === 'number' ? a.costPerPerson : parseFloat(a.costPerPerson) || 0,
          address:      a.address || '',
          url:          a.url || '',
          mapUrl:       a.mapUrl || '',
          rating:       a.rating || '',
          note:         a.note || null,
          lat:          a.lat || null,
          lng:          a.lng || null,
        }))
      );
    }
    return result;
  } catch (err) {
    console.warn('[ItineraryAgent] Failed to parse response:', err.message);
    return null;
  }
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * run(trip, travelers, options, groupProfile, stayResults, experiences, transitResult, onProgress)
 * → Activity[][] | null
 *
 * Returns null if Claude API is unavailable — caller falls back to plannerAPI simulation.
 */
export async function run(trip, travelers, options, groupProfile, stayResults, experiences, transitResult, onProgress) {
  if (!CLAUDE_API_KEY) return null;

  const numDays    = trip.days?.length || 3;
  const systemPr   = buildSystemPrompt();
  const userPrompt = buildUserPrompt(trip, options, groupProfile, stayResults, experiences, transitResult);

  // Scale max_tokens with trip length: ~1800 tokens/day (6 activities × 300 tokens each) + 3k overhead
  // Claude Haiku 4.5 supports 64k output — use it
  const maxTokens = Math.min(60000, numDays * 1800 + 3000);

  onProgress?.('🤖 ItineraryAgent synthesising all data…');
  console.log(`[ItineraryAgent] systemPrompt chars: ${systemPr.length}, userPrompt chars: ${userPrompt.length}, max_tokens: ${maxTokens} (${numDays} days)`);

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: maxTokens,
        system:     systemPr,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn('[ItineraryAgent] Claude API error', res.status, JSON.stringify(errBody));
      return null;
    }

    const data   = await res.json();
    const text   = data?.content?.[0]?.text;
    const parsed = parseResponse(text, numDays);

    if (parsed) {
      onProgress?.('✅ ItineraryAgent complete');
      return parsed;
    }

    console.warn('[ItineraryAgent] Could not parse response — falling back');
    return null;
  } catch (err) {
    console.warn('[ItineraryAgent] Fetch failed:', err.message);
    return null;
  }
}
