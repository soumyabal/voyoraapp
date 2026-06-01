/**
 * ExperienceAgent.js
 *
 * PARALLEL (Promise.all) · Phase 2: Google Places API (New)
 * Falls back to mock data if the API is unavailable or returns no results.
 *
 * Finds age-appropriate, accessibility-validated experiences for the destination.
 * Scores each by how well it matches the group's interests and age profile.
 */

import { GOOGLE_PLACES_API_KEY } from '../config';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

// ─── Places priceLevel → estimated cost per person ───────────────────────────
const PRICE_LEVEL_TO_COST = {
  'PRICE_LEVEL_FREE':           0,
  'PRICE_LEVEL_INEXPENSIVE':    15,
  'PRICE_LEVEL_MODERATE':       35,
  'PRICE_LEVEL_EXPENSIVE':      75,
  'PRICE_LEVEL_VERY_EXPENSIVE': 150,
};

// ─── Place types → interest tags ─────────────────────────────────────────────
const TYPE_TAGS = {
  museum:              ['culture', 'history', 'indoor'],
  art_gallery:         ['art', 'culture', 'indoor'],
  zoo:                 ['animals', 'family', 'outdoor'],
  aquarium:            ['animals', 'family', 'indoor'],
  amusement_park:      ['theme park', 'family', 'entertainment'],
  theme_park:          ['theme park', 'family', 'entertainment'],
  park:                ['outdoor', 'nature', 'family'],
  national_park:       ['outdoor', 'nature', 'hiking', 'scenic'],
  natural_feature:     ['outdoor', 'nature', 'scenic'],
  tourist_attraction:  ['culture', 'landmark', 'sightseeing'],
  point_of_interest:   ['culture', 'sightseeing'],
  landmark:            ['culture', 'landmark', 'history'],
  historical_landmark: ['history', 'culture'],
  beach:               ['beach', 'outdoor', 'nature'],
  hiking_area:         ['hiking', 'outdoor', 'nature', 'adventure'],
  shopping_mall:       ['shopping', 'family', 'indoor'],
  stadium:             ['entertainment', 'sports'],
  movie_theater:       ['entertainment', 'indoor', 'family'],
  performing_arts_theater: ['culture', 'entertainment', 'indoor'],
};

// Estimated visit duration (hours) by place type
const TYPE_DURATION = {
  amusement_park:      8,
  theme_park:          8,
  zoo:                 4,
  aquarium:            3,
  national_park:       3,
  museum:              2.5,
  hiking_area:         2.5,
  park:                2,
  beach:               3,
  art_gallery:         2,
  tourist_attraction:  1.5,
  landmark:            1.5,
  historical_landmark: 1.5,
  shopping_mall:       2,
  movie_theater:       2.5,
};

const ADULTS_ONLY_TYPES  = new Set(['bar', 'night_club', 'casino', 'liquor_store']);
const KID_FRIENDLY_TYPES = new Set([
  'zoo', 'aquarium', 'amusement_park', 'theme_park', 'park',
  'playground', 'museum', 'aquarium', 'movie_theater', 'beach',
]);
const STROLLER_UNFRIENDLY = new Set(['hiking_area', 'national_park']);

// ─── Mock experience database (fallback) ─────────────────────────────────────
const MOCK_EXPERIENCES = {
  'san diego': [
    { name: 'San Diego Zoo', type: 'activity', cost: 62, duration: 4, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['animals', 'family', 'outdoor'], rating: 4.7, address: '2920 Zoo Dr, San Diego, CA 92101', url: 'https://zoo.sandiegozoo.org', note: 'Book online to skip queues. Arrive at opening for animal feeding times.' },
    { name: 'Balboa Park Museums', type: 'activity', cost: 19, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['culture', 'history', 'science', 'art'], rating: 4.6, address: '1549 El Prado, San Diego, CA 92101', url: 'https://balboapark.org', note: 'Museum pass covers 17 museums — great value for multi-day visits.' },
    { name: 'USS Midway Aircraft Carrier Museum', type: 'activity', cost: 26, duration: 2.5, kidFriendly: true, wheelchairOk: true, strollerOk: false, adultsOnly: false, tags: ['history', 'military', 'science'], rating: 4.8, address: '910 N Harbor Dr, San Diego, CA 92101', url: 'https://midway.org', note: 'Strollers must be folded in some areas — carrier decks are narrow.' },
    { name: 'La Jolla Cove Snorkeling', type: 'activity', cost: 35, duration: 2, kidFriendly: true, wheelchairOk: false, strollerOk: false, adultsOnly: false, tags: ['beach', 'outdoors', 'adventure', 'snorkeling'], rating: 4.7, address: '1100 Coast Blvd, La Jolla, CA 92037', url: 'https://sandiego.org/articles/la-jolla-cove', note: 'Best visibility in the morning. Kids 8+ recommended for snorkeling.' },
    { name: 'Old Town San Diego State Historic Park', type: 'activity', cost: 0, duration: 2, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['history', 'culture', 'food', 'shopping'], rating: 4.4, address: '4002 Wallace St, San Diego, CA 92110', url: 'https://oldtownsd.com', note: 'Free entry. Great mariachi performances on weekends.' },
    { name: 'Torrey Pines State Natural Reserve', type: 'activity', cost: 15, duration: 3, kidFriendly: true, wheelchairOk: false, strollerOk: false, adultsOnly: false, tags: ['outdoors', 'hiking', 'scenic', 'nature'], rating: 4.8, address: 'N Torrey Pines Rd, La Jolla, CA 92037', url: 'https://torreypine.org', note: 'Beach Trail is the most accessible. Sunset views are spectacular.' },
  ],
  'los angeles': [
    { name: 'Universal Studios Hollywood', type: 'activity', cost: 109, duration: 8, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['theme park', 'family', 'entertainment'], rating: 4.6, address: '100 Universal City Plaza, Universal City, CA 91608', url: 'https://universalstudioshollywood.com', note: 'Buy Express Pass for big-name rides. Harry Potter area is a must.' },
    { name: 'Griffith Observatory', type: 'activity', cost: 7, duration: 2, kidFriendly: true, wheelchairOk: true, strollerOk: false, adultsOnly: false, tags: ['science', 'scenic', 'landmark', 'family'], rating: 4.8, address: '2800 E Observatory Rd, Los Angeles, CA 90027', url: 'https://griffithobservatory.org', note: 'Free building entry. Take DASH Observatory bus from Los Feliz. Planetarium show $10.' },
    { name: 'The Getty Center', type: 'activity', cost: 0, duration: 2.5, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['art', 'culture', 'scenic', 'architecture'], rating: 4.8, address: '1200 Getty Center Dr, Los Angeles, CA 90049', url: 'https://getty.edu', note: 'Free admission. Parking $20. Stunning gardens and city views.' },
    { name: 'Santa Monica Pier & Beach', type: 'activity', cost: 15, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['beach', 'family', 'outdoor', 'entertainment'], rating: 4.5, address: '200 Santa Monica Pier, Santa Monica, CA 90401', url: 'https://santamonicapier.org', note: 'Pacific Park rides ticket required. Get there early on weekends.' },
    { name: 'LACMA + La Brea Tar Pits', type: 'activity', cost: 35, duration: 4, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['art', 'science', 'history', 'culture'], rating: 4.6, address: '5905 Wilshire Blvd, Los Angeles, CA 90036', url: 'https://lacma.org', note: 'Combo ticket saves $5. Urban Lights outside LACMA is free and iconic.' },
    { name: 'Warner Bros. Studio Tour', type: 'activity', cost: 69, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['entertainment', 'behind the scenes', 'tv', 'movies'], rating: 4.8, address: '3400 Warner Blvd, Burbank, CA 91505', url: 'https://wbstudiotour.com', note: 'Book well in advance. Friends set and Batman exhibit are highlights.' },
  ],
  'san francisco': [
    { name: 'Alcatraz Island', type: 'activity', cost: 41, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: false, adultsOnly: false, tags: ['history', 'landmark', 'outdoor', 'culture'], rating: 4.8, address: 'Alcatraz Island, San Francisco, CA 94133', url: 'https://alcatrazcruises.com', note: 'Book 2–4 weeks ahead — sells out fast. Night tours are extra.' },
    { name: 'Golden Gate Bridge Walk', type: 'activity', cost: 0, duration: 2, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['landmark', 'outdoor', 'scenic', 'photography'], rating: 4.9, address: 'Golden Gate Bridge, San Francisco, CA 94129', url: 'https://goldengatebridge.org', note: 'East sidewalk for pedestrians (9am–6pm). Bring a jacket — always windy.' },
    { name: 'California Academy of Sciences', type: 'activity', cost: 35, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['science', 'family', 'nature', 'aquarium'], rating: 4.7, address: '55 Music Concourse Dr, San Francisco, CA 94118', url: 'https://calacademy.org', note: 'Planetarium and rainforest dome included. Get timed entry tickets ahead.' },
    { name: "Fisherman's Wharf & Pier 39", type: 'activity', cost: 20, duration: 2.5, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['food', 'family', 'outdoor', 'seafood', 'shopping'], rating: 4.4, address: 'Pier 39, San Francisco, CA 94133', url: 'https://pier39.com', note: 'Sea lions at K dock are free to watch. Try clam chowder in a sourdough bowl.' },
    { name: 'Muir Woods National Monument', type: 'activity', cost: 15, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['nature', 'outdoor', 'hiking', 'scenic'], rating: 4.9, address: '1 Muir Woods Rd, Mill Valley, CA 94941', url: 'https://muirwoods.com', note: 'Timed entry required — book ahead. Main Trail is paved and wheelchair accessible.' },
  ],
  'las vegas': [
    { name: 'The Strip Walk', type: 'activity', cost: 0, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['landmark', 'entertainment', 'outdoor', 'iconic'], rating: 4.5, address: 'Las Vegas Blvd, Las Vegas, NV 89109', note: 'Bellagio fountains (free, every 15-30 min). Walk from Bellagio to New York–New York (~2km).' },
    { name: 'High Roller Observation Wheel', type: 'activity', cost: 25, duration: 1, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['scenic', 'family', 'entertainment'], rating: 4.6, address: '3545 Las Vegas Blvd S, Las Vegas, NV 89109', url: 'https://caesars.com/linq/high-roller', note: 'Best views at sunset. Happy hour cabins available for adults.' },
    { name: 'Hoover Dam Tour', type: 'activity', cost: 30, duration: 4, kidFriendly: true, wheelchairOk: true, strollerOk: false, adultsOnly: false, tags: ['history', 'engineering', 'outdoor', 'scenic'], rating: 4.8, address: 'U.S. Hwy 93, Boulder City, NV 89005', url: 'https://usbr.gov/lc/hooverdam', note: 'Power Plant Tour is worth it. About 45 min drive from the Strip.' },
  ],
};

const GENERIC_EXPERIENCES = [
  { name: 'City Sightseeing Tour', type: 'activity', cost: 35, duration: 3, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['sightseeing', 'culture', 'landmark'], rating: 4.3, note: 'Hop-on hop-off bus recommended for large groups with varied interests.' },
  { name: 'Local Food Tour', type: 'activity', cost: 45, duration: 2.5, kidFriendly: true, wheelchairOk: true, strollerOk: false, adultsOnly: false, tags: ['food', 'culture', 'local'], rating: 4.5, note: 'Check dietary accommodations with the tour operator in advance.' },
  { name: 'Natural History Museum', type: 'activity', cost: 18, duration: 2, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['science', 'history', 'family', 'indoor'], rating: 4.4 },
  { name: 'City Park / Botanic Gardens', type: 'activity', cost: 5, duration: 2, kidFriendly: true, wheelchairOk: true, strollerOk: true, adultsOnly: false, tags: ['outdoor', 'nature', 'family', 'relaxed'], rating: 4.3 },
];

// ─── Google Places → experience schema mapper ─────────────────────────────────

function mapPlaceToExperience(place) {
  const name   = place.displayName?.text ?? 'Attraction';
  const types  = place.types ?? [];
  const cost   = PRICE_LEVEL_TO_COST[place.priceLevel] ?? 0;
  const rating = place.rating ?? 4.0;
  const acc    = place.accessibilityOptions ?? {};

  // Tags from type list
  const tagSet = new Set();
  types.forEach(t => (TYPE_TAGS[t] || []).forEach(tag => tagSet.add(tag)));
  if (!tagSet.size) tagSet.add('sightseeing');

  // Duration estimate — pick first matched type's duration
  let duration = 2;
  for (const t of types) {
    if (TYPE_DURATION[t]) { duration = TYPE_DURATION[t]; break; }
  }

  const adultsOnly  = types.some(t => ADULTS_ONLY_TYPES.has(t));
  const kidFriendly = !adultsOnly && types.some(t => KID_FRIENDLY_TYPES.has(t));
  const strollerOk  = !types.some(t => STROLLER_UNFRIENDLY.has(t));
  const wheelchairOk = acc.wheelchairAccessibleEntrance ??
    !types.some(t => STROLLER_UNFRIENDLY.has(t));

  return {
    name,
    type:        'activity',
    cost,
    duration,
    kidFriendly,
    wheelchairOk,
    strollerOk,
    adultsOnly,
    tags:        [...tagSet],
    rating,
    address:     place.formattedAddress ?? '',
    url:         place.websiteUri ?? '',
    note:        null,
  };
}

// ─── Google Places API call ───────────────────────────────────────────────────

async function fetchPlacesQuery(textQuery) {
  const res = await fetch(PLACES_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type':     'application/json',
      'X-Goog-Api-Key':   GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types,places.accessibilityOptions,places.websiteUri',
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: 15,
    }),
  });

  if (!res.ok) {
    console.warn('[ExperienceAgent] Places API error:', res.status);
    return [];
  }

  const data = await res.json();
  return (data.places ?? []).map(mapPlaceToExperience);
}

async function searchExperiencesFromPlaces(destination, groupProfile) {
  if (!GOOGLE_PLACES_API_KEY) return null;

  // Always fetch top attractions; add family-specific query for kid groups
  const queries = [`top tourist attractions in ${destination}`];
  if (groupProfile.hasKids || groupProfile.hasInfants) {
    queries.push(`family activities for kids in ${destination}`);
  }

  try {
    const results = await Promise.all(queries.map(fetchPlacesQuery));

    // Merge and deduplicate by name
    const seen   = new Set();
    const merged = results.flat().filter(exp => {
      const key = exp.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!merged.length) return null;

    console.log(`[ExperienceAgent] Google Places returned ${merged.length} experiences for "${destination}"`);
    return merged;

  } catch (err) {
    console.warn('[ExperienceAgent] Places API fetch failed:', err.message);
    return null;
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreExperience(exp, groupProfile) {
  let score = 0;
  const reasons = [];

  // Hard filter: wheelchair inaccessible for groups that need it
  if (groupProfile.hasWheelchair && !exp.wheelchairOk) return null;
  if (groupProfile.hasInfants && !exp.strollerOk && exp.type !== 'food') {
    score -= 10;
  }

  if (groupProfile.hasWheelchair && exp.wheelchairOk)                   { score += 20; reasons.push('Wheelchair accessible'); }
  if ((groupProfile.hasKids || groupProfile.hasInfants) && exp.kidFriendly) { score += 25; reasons.push('Kid-friendly'); }
  if (exp.strollerOk && groupProfile.hasStroller)                       { score += 10; reasons.push('Stroller-friendly'); }

  // Interest matching
  const interestMatches = (groupProfile.interests || []).filter(interest =>
    (exp.tags || []).some(tag =>
      tag.toLowerCase().includes(interest.toLowerCase()) ||
      interest.toLowerCase().includes(tag.toLowerCase())
    )
  );
  score += interestMatches.length * 15;
  if (interestMatches.length > 0) reasons.push(`Matches interests: ${interestMatches.join(', ')}`);

  // Rating boost
  score += Math.round((exp.rating || 4) * 5);

  // Cost fit
  const budgetMax = { budget: 30, 'mid-range': 70, luxury: 200 }[groupProfile.budget] || 70;
  if (exp.cost <= budgetMax) score += 10;

  return { ...exp, fitScore: score, fitReasons: reasons };
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * run(groupProfile, destination, days) → ExperienceResult[]
 *
 * Returns top experiences sorted by fit score (best matches first).
 * Returns enough options for the ItineraryAgent to fill each day.
 */
export async function run(groupProfile, destination, days) {
  // Try Google Places first, fall back to mock
  const cityKey        = (destination || '').toLowerCase().split(',')[0].trim();
  const apiExperiences = await searchExperiencesFromPlaces(destination, groupProfile);
  const pool           = apiExperiences ?? MOCK_EXPERIENCES[cityKey] ?? GENERIC_EXPERIENCES;

  const scored = pool
    .map(exp => scoreExperience(exp, groupProfile))
    .filter(Boolean)
    .sort((a, b) => b.fitScore - a.fitScore);

  // Return enough for 2–3 activities/day + buffer
  return scored.slice(0, Math.max(scored.length, days * 3));
}
