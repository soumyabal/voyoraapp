/**
 * booking.js — build a Booking.com search deep-link for a specific lodging place.
 *
 * PURE + synchronous: no network, no API key, no package. Just a URL string the UI
 * hands to Linking.openURL (the same user-initiated outward behavior as opening a
 * venue's own site or Google Maps).
 *
 * Affiliate revenue: the owner's Booking Affiliate Partner ID lives in
 * config.BOOKING_AFFILIATE.aid. When set, it's appended as `aid=` so clicks are
 * attributed. When null, the link STILL works — it's just an unattributed search —
 * so the feature ships now and starts earning the moment the id is dropped in.
 * (The affiliate account/approval + the commission disclosure are the owner's to do.)
 *
 * Works on both a Discover Place ({activityType:'stay'}) and a saved Activity
 * ({type:'stay'}), so a "Book" button can be re-derived anywhere from stored fields —
 * which means a later-added affiliate id applies to already-saved trips too.
 */
import { BOOKING_AFFILIATE } from '../config';

const isStay = (p) => p?.activityType === 'stay' || p?.type === 'stay';

// Itinerary stays are often phrased as actions ("Check-in: The Layar Villa",
// "Checkout & …") rather than bare hotel names. That prefix pollutes the Booking
// search and makes it bounce to the homepage instead of the property — so strip a
// leading lodging verb before building the query. Discover-added hotels (clean
// names) are unaffected.
const cleanStayName = (raw) =>
  (raw || '')
    .replace(/^\s*(check[\s-]?in|check[\s-]?out|checkin|checkout|stay(?:ing)?(?:\s+at)?|lodging|hotel|accommodation)\s*[:\-–]\s*/i, '')
    .trim();

export function bookingUrl(place, cfg = BOOKING_AFFILIATE) {
  if (!isStay(place)) return null;

  const name = cleanStayName(place.name);
  const city = (place.city || '').trim();
  // Pinpoint the hotel by name + locality; degrade gracefully when fields are missing.
  let query = '';
  if (name && city) query = `${name}, ${city}`;
  else if (name && place.address) query = `${name}, ${place.address}`;
  else query = name || place.address || '';
  query = query.trim();
  if (!query) return null;   // nothing searchable → caller falls back to the venue site

  const params = [`ss=${encodeURIComponent(query)}`];
  if (cfg && cfg.aid) params.push(`aid=${encodeURIComponent(cfg.aid)}`);
  return `https://www.booking.com/searchresults.html?${params.join('&')}`;
}
