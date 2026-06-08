/**
 * StayAgent.js
 *
 * PARALLEL (Promise.all) · Phase 2: Google Places API (New)
 * Falls back to mock data if the API is unavailable or returns no results.
 *
 * Finds family-appropriate hotels for the destination.
 * Filters/scores by: family rooms, wheelchair access, stroller-friendly,
 * connecting rooms, and budget fit.
 */

import { GOOGLE_PLACES_API_KEY } from '../config';
import { withBundleId } from '../utils/googleApi';

const PLACES_API_URL = 'https://places.googleapis.com/v1/places:searchText';

// ─── Budget tier → estimated room rate (used for mock fallback) ───────────────
const BUDGET_ROOM_RATE = { budget: 85, 'mid-range': 160, luxury: 320 };

// ─── Google Places priceLevel → estimated room rate per night ────────────────
const PRICE_LEVEL_TO_RATE = {
  'PRICE_LEVEL_FREE':           80,
  'PRICE_LEVEL_INEXPENSIVE':    95,
  'PRICE_LEVEL_MODERATE':       160,
  'PRICE_LEVEL_EXPENSIVE':      280,
  'PRICE_LEVEL_VERY_EXPENSIVE': 450,
};

// ─── Mock hotel database (fallback) ──────────────────────────────────────────
const MOCK_HOTELS = {
  'san diego': [
    { name: 'Marriott Marquis San Diego Marina', stars: 4, pricePerRoom: 189, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: true, address: '333 W Harbor Dr, San Diego, CA 92101', amenities: ['pool', 'spa', 'kids club', 'restaurant'] },
    { name: 'Hotel del Coronado', stars: 4, pricePerRoom: 349, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: true, address: '1500 Orange Ave, Coronado, CA 92118', amenities: ['beach', 'pool', 'spa', 'multiple restaurants'] },
    { name: 'Omni San Diego Hotel', stars: 4, pricePerRoom: 199, wheelchairOk: true, familyRooms: true, connectingRooms: false, strollerFriendly: true, nearBeach: false, address: '675 L St, San Diego, CA 92101', amenities: ['pool', 'gym', 'restaurant', 'connected to Petco Park'] },
  ],
  'los angeles': [
    { name: 'The Westin Bonaventure Hotel', stars: 4, pricePerRoom: 199, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '404 S Figueroa St, Los Angeles, CA 90071', amenities: ['pool', 'gym', 'multiple restaurants', 'central location'] },
    { name: 'Loews Santa Monica Beach Hotel', stars: 4, pricePerRoom: 329, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: true, address: '1700 Ocean Ave, Santa Monica, CA 90401', amenities: ['beach access', 'pool', 'kids program', 'restaurant'] },
    { name: 'Hilton Los Angeles Airport', stars: 3, pricePerRoom: 149, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '5711 W Century Blvd, Los Angeles, CA 90045', amenities: ['pool', 'gym', 'restaurant', 'shuttle to LAX'] },
  ],
  'san francisco': [
    { name: 'Hyatt Regency San Francisco', stars: 4, pricePerRoom: 229, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '5 Embarcadero Center, San Francisco, CA 94111', amenities: ['pool', 'gym', 'restaurant', 'waterfront views'] },
    { name: 'Hotel Nikko San Francisco', stars: 4, pricePerRoom: 209, wheelchairOk: true, familyRooms: true, connectingRooms: false, strollerFriendly: true, nearBeach: false, address: '222 Mason St, San Francisco, CA 94102', amenities: ['pool', 'gym', 'restaurant', 'Union Square location'] },
    { name: 'Kimpton Everton Hotel', stars: 4, pricePerRoom: 189, wheelchairOk: true, familyRooms: false, connectingRooms: false, strollerFriendly: true, nearBeach: false, address: '36 7th St, San Francisco, CA 94103', amenities: ['gym', 'restaurant', 'pet friendly', 'central location'] },
  ],
  'las vegas': [
    { name: 'The Palazzo at The Venetian', stars: 5, pricePerRoom: 279, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '3325 S Las Vegas Blvd, Las Vegas, NV 89109', amenities: ['pool', 'spa', 'kids friendly zones', 'multiple restaurants'] },
    { name: 'MGM Grand Hotel & Casino', stars: 4, pricePerRoom: 149, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '3799 S Las Vegas Blvd, Las Vegas, NV 89109', amenities: ['pool complex', 'spa', 'kids program', 'restaurants'] },
    { name: "Marriott's Grand Chateau", stars: 4, pricePerRoom: 199, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '75 E Harmon Ave, Las Vegas, NV 89158', amenities: ['pool', 'kitchen suites', 'central Strip location', 'family suites'] },
  ],
  'new york': [
    { name: 'Marriott Marquis New York', stars: 4, pricePerRoom: 349, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '1535 Broadway, New York, NY 10036', amenities: ['pool', 'gym', 'restaurant', 'Times Square location'] },
    { name: 'Hotel Edison', stars: 3, pricePerRoom: 199, wheelchairOk: true, familyRooms: true, connectingRooms: false, strollerFriendly: true, nearBeach: false, address: '228 W 47th St, New York, NY 10036', amenities: ['gym', 'restaurant', 'Times Square location', 'classic NYC hotel'] },
    { name: 'Hilton Midtown', stars: 4, pricePerRoom: 289, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, nearBeach: false, address: '1335 6th Ave, New York, NY 10019', amenities: ['gym', 'multiple restaurants', 'Central Park proximity'] },
  ],
};

const GENERIC_HOTELS = [
  { name: 'City Center Hotel', stars: 3, pricePerRoom: 120, wheelchairOk: true, familyRooms: true, connectingRooms: false, strollerFriendly: true, amenities: ['pool', 'breakfast', 'central location'] },
  { name: 'Premier Inn', stars: 3, pricePerRoom: 99, wheelchairOk: true, familyRooms: true, connectingRooms: false, strollerFriendly: true, amenities: ['breakfast', 'accessible rooms', 'family friendly'] },
  { name: 'Marriott Courtyard', stars: 3, pricePerRoom: 149, wheelchairOk: true, familyRooms: true, connectingRooms: true, strollerFriendly: true, amenities: ['pool', 'gym', 'breakfast', 'connecting rooms available'] },
];

// ─── Google Places → hotel schema mapper ─────────────────────────────────────

function mapPlaceToHotel(place) {
  const name         = place.displayName?.text ?? 'Hotel';
  const pricePerRoom = PRICE_LEVEL_TO_RATE[place.priceLevel] ?? 160;
  const rating       = place.rating ?? 3.5;
  const stars        = rating >= 4.5 ? 5 : rating >= 4.0 ? 4 : rating >= 3.0 ? 3 : 2;
  const acc          = place.accessibilityOptions ?? {};
  const addr         = place.formattedAddress ?? '';

  // Infer amenities from type list + price tier
  const amenities = ['restaurant'];
  if (pricePerRoom >= 200) amenities.push('spa', 'concierge');
  if (pricePerRoom >= 130) amenities.push('gym');
  if (pricePerRoom >= 160) amenities.push('pool');

  return {
    name,
    stars,
    pricePerRoom,
    // Infer family-friendliness from price (higher-end hotels tend to have family/connecting rooms)
    wheelchairOk:     acc.wheelchairAccessibleEntrance ?? true,
    familyRooms:      pricePerRoom >= 130,
    connectingRooms:  pricePerRoom >= 175,
    strollerFriendly: acc.wheelchairAccessibleEntrance ?? true,
    nearBeach:        /beach|ocean|sea|marina|waterfront|coastal/i.test(addr),
    address:          addr,
    amenities:        [...new Set(amenities)],
    url:              place.websiteUri ?? '',
  };
}

// ─── Google Places API call ───────────────────────────────────────────────────

async function searchHotelsFromPlaces(destination, groupProfile) {
  if (!GOOGLE_PLACES_API_KEY) return null;

  // Tailor query to group needs
  const query = groupProfile.hasWheelchair
    ? `accessible hotels in ${destination}`
    : (groupProfile.hasKids || groupProfile.hasInfants || groupProfile.totalFamilies > 1)
      ? `family hotels in ${destination}`
      : `hotels in ${destination}`;

  try {
    const res = await fetch(PLACES_API_URL, {
      method:  'POST',
      headers: withBundleId({
        'Content-Type':     'application/json',
        'X-Goog-Api-Key':   GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types,places.accessibilityOptions,places.websiteUri',
      }),
      body: JSON.stringify({
        textQuery:      query,
        maxResultCount: 10,
        includedType:   'lodging',
      }),
    });

    if (!res.ok) {
      console.warn('[StayAgent] Places API error:', res.status);
      return null;
    }

    const data   = await res.json();
    const places = data.places ?? [];
    if (!places.length) return null;

    console.log(`[StayAgent] Google Places returned ${places.length} hotels for "${destination}"`);
    return places.map(mapPlaceToHotel);

  } catch (err) {
    console.warn('[StayAgent] Places API fetch failed:', err.message);
    return null;
  }
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * run(groupProfile, destination, nights) → StayResult[]
 *
 * StayResult: {
 *   name, stars, pricePerRoom, totalRoomCost (per night),
 *   wheelchairOk, familyRooms, connectingRooms, strollerFriendly,
 *   amenities, address, fitScore, fitReasons[]
 * }
 */
export async function run(groupProfile, destination, nights) {
  // Try Google Places first, fall back to mock
  const cityKey   = (destination || '').toLowerCase().split(',')[0].trim();
  const apiHotels = await searchHotelsFromPlaces(destination, groupProfile);
  const pool      = apiHotels ?? MOCK_HOTELS[cityKey] ?? GENERIC_HOTELS;

  // ── Score hotels for this group ───────────────────────────────────────────
  const scored = pool.map(hotel => {
    let score = 0;
    const reasons = [];
    const missing = [];

    if (groupProfile.hasWheelchair) {
      if (hotel.wheelchairOk) { score += 30; reasons.push('Fully wheelchair accessible'); }
      else missing.push('⚠️ Accessibility not confirmed');
    }

    if (groupProfile.hasKids || groupProfile.hasInfants) {
      if (hotel.familyRooms)     { score += 20; reasons.push('Family rooms available'); }
      if (hotel.strollerFriendly){ score += 10; reasons.push('Stroller-friendly (lifts, ramps)'); }
    }

    if (groupProfile.totalFamilies > 1 && hotel.connectingRooms) {
      score += 15; reasons.push('Connecting rooms — ideal for multi-family');
    }

    // Budget fit
    const budgetRate = BUDGET_ROOM_RATE[groupProfile.budget] || 160;
    if (hotel.pricePerRoom <= budgetRate)            { score += 20; reasons.push(`Within ${groupProfile.budget} budget`); }
    else if (hotel.pricePerRoom <= budgetRate * 1.3) { score += 10; reasons.push('Slightly over budget — great value for features'); }
    else missing.push(`Over ${groupProfile.budget} budget by $${hotel.pricePerRoom - budgetRate}/room`);

    // Beach / interest matching
    if (groupProfile.interests?.some(i => /beach|ocean|surf/i.test(i)) && hotel.nearBeach) {
      score += 10; reasons.push('Near beach — matches group interests');
    }

    return {
      ...hotel,
      totalRoomCost: hotel.pricePerRoom * groupProfile.totalRoomsNeeded,
      totalStayCost: hotel.pricePerRoom * groupProfile.totalRoomsNeeded * nights,
      roomsNeeded:   groupProfile.totalRoomsNeeded,
      fitScore:      score,
      fitReasons:    reasons,
      fitWarnings:   missing,
    };
  });

  return scored
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, 3);
}
