/**
 * distanceChecker.js
 *
 * Async distance validation for Check Trip.
 * Uses the Google Distance Matrix API to check travel time between
 * consecutive activities that have lat/lng coordinates (Discover-added).
 *
 * Cost: 1 API call per day that has ≥2 located activities.
 * Controlled by RELEASE_FLAGS.distanceWarnings in config.js.
 *
 * Returns two warning types:
 *   transit_gap   — error   — actual travel time > available gap (impossible)
 *   transit_tight — warning — travel time within 15 min of gap (risky)
 */

import { GOOGLE_PLACES_API_KEY, RELEASE_FLAGS } from '../config';
import { withBundleId } from './googleApi';

const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';

// ─── Helpers ──────────────────────────────────────────────────────

function toMinutes(timeStr) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime(totalMin) {
  const h = Math.floor(Math.max(0, totalMin) / 60) % 24;
  const m = Math.max(0, totalMin) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ─── Fingerprint ──────────────────────────────────────────────────
// Stable string representing all located activity pairs.
// If this matches the cached fingerprint, cached results are still valid.

export function activityFingerprint(trip) {
  return (trip.days || []).map(day =>
    (day.activities || [])
      .filter(a => a.status !== 'skipped' && a.lat != null && a.lng != null)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .map(a => `${a.id}:${a.time}:${a.lat.toFixed(5)}:${a.lng.toFixed(5)}`)
      .join(',')
  ).join('|');
}

// Returns true when the cached result is still valid for the current activities.
export function isCacheFresh(trip) {
  const cache = trip?.distanceCache;
  if (!cache?.fingerprint) return false;
  return cache.fingerprint === activityFingerprint(trip);
}

// ─── Distance Matrix fetch ─────────────────────────────────────────
// Batches N consecutive pairs into a single API call.
// The Distance Matrix returns an N×N grid — we read the diagonal [i][i]
// to get the distance from pair[i].from → pair[i].to.

async function fetchDistanceMatrix(pairs) {
  const origins      = pairs.map(p => `${p.from.lat},${p.from.lng}`).join('|');
  const destinations = pairs.map(p => `${p.to.lat},${p.to.lng}`).join('|');

  const url =
    `${DISTANCE_MATRIX_URL}` +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=driving` +
    `&key=${GOOGLE_PLACES_API_KEY}`;

  const res = await fetch(url, { headers: withBundleId() });
  if (!res.ok) throw new Error(`Distance Matrix HTTP ${res.status}`);

  const data = await res.json();
  if (data.status !== 'OK') throw new Error(`Distance Matrix: ${data.status}`);

  // Extract diagonal results
  return pairs.map((pair, i) => {
    const element = data.rows?.[i]?.elements?.[i];
    if (!element || element.status !== 'OK') return null;
    return {
      travelMins: Math.ceil((element.duration?.value || 0) / 60),
      travelText: element.duration?.text || '',
      distText:   element.distance?.text || '',
    };
  });
}

// ─── Main export ──────────────────────────────────────────────────

/**
 * checkDistances(trip, { forceRefresh } = {})
 *
 * Async. Returns { warnings, fingerprint, checkedAt } or throws.
 * Returns cached result immediately when fingerprint is unchanged
 * (unless forceRefresh is true).
 *
 * Returns null immediately if:
 *   - RELEASE_FLAGS.distanceWarnings is false
 *   - GOOGLE_PLACES_API_KEY is not set
 */
export async function checkDistances(trip, { forceRefresh = false } = {}) {
  if (!RELEASE_FLAGS.distanceWarnings) return null;
  if (!GOOGLE_PLACES_API_KEY)          return null;
  if (!trip?.days?.length)             return null;

  const fingerprint = activityFingerprint(trip);

  // Return cached result if still valid
  if (!forceRefresh && isCacheFresh(trip)) {
    return {
      warnings:    trip.distanceCache.warnings,
      fingerprint,
      checkedAt:   trip.distanceCache.checkedAt,
      fromCache:   true,
    };
  }

  const warnings = [];

  for (let dayIndex = 0; dayIndex < trip.days.length; dayIndex++) {
    const day = trip.days[dayIndex];

    // Only activities with coordinates and not skipped, sorted by time
    const locatedActs = [...(day.activities || [])]
      .filter(a => a.status !== 'skipped' && a.lat != null && a.lng != null)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    if (locatedActs.length < 2) continue;

    // Build consecutive pairs
    const pairs = [];
    for (let i = 0; i < locatedActs.length - 1; i++) {
      pairs.push({ from: locatedActs[i], to: locatedActs[i + 1] });
    }

    try {
      const results = await fetchDistanceMatrix(pairs);

      pairs.forEach((pair, i) => {
        const result = results[i];
        if (!result) return;

        const { travelMins, travelText, distText } = result;
        const gapMins = toMinutes(pair.to.time) - toMinutes(pair.from.time);

        // Negative or zero gap means overlap — already handled by Rule 1
        if (gapMins <= 0) return;

        const bufferMins = gapMins - travelMins;
        const distPart   = distText ? ` (${distText})` : '';

        if (bufferMins < 0) {
          // Impossible — travel takes longer than the gap
          const suggested = formatTime(toMinutes(pair.from.time) + travelMins + 5);
          warnings.push({
            type:          'transit_gap',
            severity:      'error',
            icon:          '🗺️',
            title:         'Not enough travel time',
            message:       `${travelText}${distPart} to get from "${pair.from.name}" to "${pair.to.name}", but only ${gapMins} min gap.`,
            hint:          `Move "${pair.to.name}" to ${suggested} or later to allow for travel.`,
            suggestedTime: suggested,
            moveActId:     pair.to.id,
            moveActName:   pair.to.name,
            impactedActivities: [{
              id:            pair.to.id,
              name:          pair.to.name,
              time:          pair.to.time,
              suggestedTime: suggested,
            }],
            dayIndex,
            actIds: [pair.from.id, pair.to.id],
            _isDistance: true,  // distinguishes from schedule-overlap warnings
          });
        } else if (bufferMins < 15) {
          // Tight — less than 15 min buffer
          warnings.push({
            type:     'transit_tight',
            severity: 'warning',
            icon:     '⏱️',
            title:    'Tight travel window',
            message:  `${travelText}${distPart} to get from "${pair.from.name}" to "${pair.to.name}". Only ${bufferMins} min to spare.`,
            hint:     'Allow extra buffer for traffic, parking, or delays.',
            dayIndex,
            actIds:   [pair.from.id, pair.to.id],
            _isDistance: true,
          });
        }
      });
    } catch (err) {
      console.warn(`[distanceChecker] Day ${dayIndex}:`, err.message);
      // Fail silently — distance warnings are advisory, not critical
    }
  }

  return {
    warnings,
    fingerprint,
    checkedAt:  Date.now(),
    fromCache:  false,
  };
}

/**
 * countLocatedActivityPairs(trip)
 *
 * Returns how many API calls checkDistances would make.
 * Useful for showing a cost estimate before enabling the feature.
 */
export function countLocatedActivityPairs(trip) {
  if (!trip?.days) return 0;
  return trip.days.reduce((total, day) => {
    const located = (day.activities || []).filter(
      a => a.status !== 'skipped' && a.lat != null && a.lng != null
    );
    return total + Math.max(0, located.length - 1);
  }, 0);
}
