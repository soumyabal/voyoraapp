/**
 * discoverPlaces.js — pure helpers for Discover's Google Places handling: normalizing a raw
 * Places result into our place shape (mapPlace), classifying type (inferActivityType),
 * price→cost, veg-friendliness, and great-circle distance (metersBetween). Extracted from
 * DiscoverModal so this logic is unit-testable. No React, no network — pure transforms.
 */
import { GOOGLE_PLACES_API_KEY } from '../config';
import { compactHours } from './hours';

export const PRICE_TO_COST = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 15, PRICE_LEVEL_MODERATE: 35,
  PRICE_LEVEL_EXPENSIVE: 75, PRICE_LEVEL_VERY_EXPENSIVE: 150,
};

export function inferActivityType(types = []) {
  // Lodging WINS over food: a resort/hotel almost always also lists 'restaurant'/'food'
  // for its in-house dining (Great Wolf Lodge's types include resort_hotel AND restaurant
  // AND food). Checking food first mis-filed it as a restaurant, so the Stay layer hid it.
  if (types.some(t => ['lodging', 'hotel', 'resort_hotel', 'motel', 'guest_house', 'bed_and_breakfast', 'campground', 'rv_park'].includes(t))) return 'stay';
  if (types.some(t => ['restaurant', 'food', 'meal_takeaway', 'bakery', 'cafe', 'coffee_shop', 'bar'].includes(t))) return 'food';
  return 'activity';
}

// Great-circle distance in metres — used to drop area-search outliers (Google's
// locationBias is a hint, not a hard radius, so it can return far-off results).
export function metersBetween(a, b) {
  const R = 6371000, toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const VEG_NAME_RE = /vegetarian|vegan|veggie|plant.based|organic|salad|juice|smoothie|falafel/i;
const VEG_TYPES = new Set(['cafe', 'bakery', 'juice_bar', 'health', 'natural_goods']);
export function isVegFriendly(place) {
  if (VEG_NAME_RE.test(place.name)) return true;
  return (place.types || []).some(t => VEG_TYPES.has(t));
}

// Google Place Photos: a photo resource name → image URL (billed per fetch).
const photoUrl = name => `https://places.googleapis.com/v1/${name}/media?maxWidthPx=640&maxHeightPx=420&key=${GOOGLE_PLACES_API_KEY}`;

// Normalize one raw Google Places (New) result into our internal place shape.
export function mapPlace(p) {
  const place = {
    name: p.displayName?.text ?? 'Place', address: p.formattedAddress ?? '',
    rating: p.rating ?? null, ratingCount: p.userRatingCount ?? 0,
    costPerPerson: PRICE_TO_COST[p.priceLevel] ?? 0, priceLevel: p.priceLevel ?? null, types: p.types ?? [],
    activityType: inferActivityType(p.types ?? []),
    wheelchairOk: p.accessibilityOptions?.wheelchairAccessibleEntrance ?? null,
    url: p.websiteUri ?? '', lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
    photo: p.photos?.[0]?.name ? photoUrl(p.photos[0].name) : null,
    openHours: compactHours(p.regularOpeningHours),
    businessStatus: p.businessStatus ?? null,   // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  };
  place.vegFriendly = isVegFriendly(place);
  return place;
}
