/**
 * placeScore.js — the deterministic place-ranking KERNEL.
 *
 * Pure, stateless math: score a place for a group. It holds NO data — the taxonomy
 * and weights live in placeScore.constants.js (see docs/engine-architecture.md
 * "Data tiers"), and the place + profile arrive as arguments. That's what keeps it
 * ~200 lines forever and identical whether the data comes from the mock today or a
 * Postgres+PostGIS catalog later.
 *
 * One scorer, two callers: the deterministic Discover ranking (live) and the
 * flag-gated AI pipeline (later) grade candidates the same way — "one engine ranks."
 *
 * place   = the Discover Place shape — { rating, ratingCount, types, activityType,
 *           wheelchairOk, vegFriendly, costPerPerson, lat, lng }
 * profile = a GroupProfile (src/agents/FamilyProfileAgent.run) or null
 * context = { focusPoint:{lat,lng}, weights } — optional
 */
import { haversineKm } from './geo';
import {
  TYPE_TAGS,
  KID_FRIENDLY_TYPES,
  ADULTS_ONLY_TYPES,
  STROLLER_UNFRIENDLY_TYPES,
  BUDGET_MAX,
  WEIGHTS,
} from './placeScore.constants';

/**
 * Base quality kernel: rating (0–5) + damped popularity (log of review count),
 * so a 5.0 with 3 reviews can't outrank a proven 4.7 with thousands. Profile-free.
 * This is the score Discover used before group-fit existed.
 */
export function qualityScore(place) {
  const rating  = place?.rating || 0;
  const reviews = place?.ratingCount || 0;
  return rating + Math.log10(1 + reviews) * 0.5;
}

const someType = (types, set) => (types || []).some(t => set.has(t));

// Loose tag set for a place: taxonomy tags + de-underscored raw types + activityType.
function placeTags(place) {
  const tags = new Set();
  (place?.types || []).forEach(t => {
    (TYPE_TAGS[t] || []).forEach(tag => tags.add(tag));
    tags.add(t.replace(/_/g, ' '));
  });
  if (place?.activityType) tags.add(place.activityType);
  return [...tags];
}

// How many of the group's interests this place plausibly satisfies (substring either way).
function interestHits(interests, place) {
  if (!interests || !interests.length) return 0;
  const tags = placeTags(place);
  return interests.filter(i => {
    const li = String(i).toLowerCase();
    return tags.some(t => {
      const lt = t.toLowerCase();
      return lt.includes(li) || li.includes(lt);
    });
  }).length;
}

/**
 * scorePlace(place, profile, context) → number
 *   higher = better · -Infinity = hard-excluded (wheelchair group, inaccessible venue)
 *   profile null/omitted → quality-only (backward compatible with the old placeScore).
 * Pure.
 */
export function scorePlace(place, profile = null, context = {}) {
  const W = { ...WEIGHTS, ...(context.weights || {}) };
  let s = qualityScore(place);
  if (!profile) return s;

  const types = place?.types || [];

  // HARD constraint: a wheelchair-using group excludes a venue KNOWN inaccessible.
  // wheelchairOk === false = positive inaccessibility signal; null = unknown → keep.
  if (profile.hasWheelchair && place?.wheelchairOk === false) return -Infinity;
  if (profile.hasWheelchair && place?.wheelchairOk === true) s += W.wheelchair;

  const kidGroup = profile.hasKids || profile.hasInfants;
  if (kidGroup && someType(types, KID_FRIENDLY_TYPES)) s += W.kidFriendly;
  if (kidGroup && someType(types, ADULTS_ONLY_TYPES))  s -= W.adultsOnlyPenalty;
  if (profile.hasStroller && someType(types, STROLLER_UNFRIENDLY_TYPES)) s -= W.strollerPenalty;

  s += interestHits(profile.interests, place) * W.interest;

  if (place?.activityType === 'food' && (profile.vegetarianCount || 0) > 0) {
    s += place.vegFriendly ? W.veg : -W.vegMissPenalty;
  }

  const budgetMax = BUDGET_MAX[profile.budget] ?? BUDGET_MAX['mid-range'];
  if ((place?.costPerPerson ?? 0) <= budgetMax) s += W.budgetFit;

  // Distance is OFF unless a focus point is supplied (Discover leaves it to the map).
  if (context.focusPoint && place?.lat != null && place?.lng != null) {
    const km = haversineKm(context.focusPoint, place);
    if (km != null) s -= km * W.distancePerKm;
  }

  return s;
}

/**
 * scorePlaceDetailed — same score plus human-readable reasons, for debugging and a
 * future "why this ranks" affordance. Never on the hot path.
 */
export function scorePlaceDetailed(place, profile = null, context = {}) {
  const reasons = [];
  if (profile) {
    if (profile.hasWheelchair && place?.wheelchairOk === false) {
      return { score: -Infinity, reasons: ['Excluded — not wheelchair accessible'] };
    }
    if (profile.hasWheelchair && place?.wheelchairOk === true) reasons.push('Wheelchair accessible');
    const kidGroup = profile.hasKids || profile.hasInfants;
    if (kidGroup && someType(place?.types, KID_FRIENDLY_TYPES)) reasons.push('Kid-friendly');
    if (kidGroup && someType(place?.types, ADULTS_ONLY_TYPES))  reasons.push('Adults-only venue');
    if (profile.hasStroller && someType(place?.types, STROLLER_UNFRIENDLY_TYPES)) reasons.push('Tough with a stroller');
    const hits = interestHits(profile.interests, place);
    if (hits) reasons.push(`Matches ${hits} interest${hits > 1 ? 's' : ''}`);
    if (place?.activityType === 'food' && (profile.vegetarianCount || 0) > 0) {
      reasons.push(place.vegFriendly ? 'Veg-friendly' : 'No veg signal');
    }
  }
  return { score: scorePlace(place, profile, context), reasons };
}
