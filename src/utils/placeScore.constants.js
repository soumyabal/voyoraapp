/**
 * placeScore.constants.js — the small, code-cadence taxonomy + weights the scorer
 * reads. DATA only (see docs/engine-architecture.md "Data tiers"): the scorer in
 * placeScore.js holds NO data — it reads everything from here, so it stays a pure
 * ~200-line kernel and this file is where a new place-type or a tuned weight lands.
 *
 * The type taxonomy mirrors src/agents/ExperienceAgent.js so the deterministic
 * Discover ranking and the (flag-gated) AI pipeline grade places the same way.
 */

// Google place types → interest tags (matched against a group's interests).
export const TYPE_TAGS = {
  museum:                  ['culture', 'history', 'indoor'],
  art_gallery:             ['art', 'culture', 'indoor'],
  zoo:                     ['animals', 'family', 'outdoor'],
  aquarium:                ['animals', 'family', 'indoor'],
  amusement_park:          ['theme park', 'family', 'entertainment'],
  theme_park:              ['theme park', 'family', 'entertainment'],
  park:                    ['outdoor', 'nature', 'family'],
  national_park:           ['outdoor', 'nature', 'hiking', 'scenic'],
  natural_feature:         ['outdoor', 'nature', 'scenic'],
  tourist_attraction:      ['culture', 'landmark', 'sightseeing'],
  point_of_interest:       ['culture', 'sightseeing'],
  landmark:                ['culture', 'landmark', 'history'],
  historical_landmark:     ['history', 'culture'],
  beach:                   ['beach', 'outdoor', 'nature'],
  hiking_area:             ['hiking', 'outdoor', 'nature', 'adventure'],
  shopping_mall:           ['shopping', 'family', 'indoor'],
  stadium:                 ['entertainment', 'sports'],
  movie_theater:           ['entertainment', 'indoor', 'family'],
  performing_arts_theater: ['culture', 'entertainment', 'indoor'],
  restaurant:              ['food'],
  cafe:                    ['food', 'coffee'],
};

export const KID_FRIENDLY_TYPES = new Set([
  'zoo', 'aquarium', 'amusement_park', 'theme_park', 'park',
  'playground', 'museum', 'movie_theater', 'beach',
]);

export const ADULTS_ONLY_TYPES = new Set(['bar', 'night_club', 'casino', 'liquor_store']);

export const STROLLER_UNFRIENDLY_TYPES = new Set(['hiking_area', 'national_park']);

// Budget ceiling (per-person $) by trip budget tier — a place at/under it gets a nudge.
export const BUDGET_MAX = { budget: 30, 'mid-range': 70, luxury: 200 };

// Scoring weights. Tuned so the base quality kernel (rating + damped popularity,
// ~4–7.5) still orders similar places, while group-fit meaningfully RE-orders.
// Override per-call via context.weights.
export const WEIGHTS = {
  wheelchair:        1.0,   // boost for a confirmed-accessible venue when the group needs it
  kidFriendly:       1.0,
  adultsOnlyPenalty: 3.0,   // strong demote for bar/club/casino when kids/infants present
  strollerPenalty:   1.0,   // hiking/national-park with a stroller
  interest:          1.5,   // per matched interest
  veg:               1.0,   // veg-friendly restaurant when the group has vegetarians
  vegMissPenalty:    1.5,   // restaurant with no veg signal, same case
  budgetFit:         0.5,
  distancePerKm:     0.05,  // only applied when context.focusPoint is given
};
