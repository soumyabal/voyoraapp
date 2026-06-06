/**
 * tripFilm.js — turns a trip into the "Play My Trip" film: a "Trip Wrapped" deck of branded
 * gradient cards (cover → who → days → the fair-split moat → branded close), backed by the
 * trip's OWN cached place photos wherever it has them.
 *
 * Photos come ONLY from what's already saved on the trip's activities (act.photo — the cached
 * Google Place photo URLs). NO live fetching, no new API calls: this is the user viewing their
 * own saved trip, the same imagery already shown on every itinerary thumbnail. Any slide with
 * no cached photo falls back to its gradient card, so the film is always beautiful, never broken.
 *
 * PURE + deterministic (same trip → same film; no Date/no random), so it's snapshot-testable.
 * The renderer (PlayTripModal) re-stamps the current API key onto each photoUrl at display time.
 *
 * Slide shape: { type, grad:[c1,c2], kicker?, emoji?, big?, title?, subtitle?, brand?,
 *                photoUrl?, photoName? }
 *   type      = 'cover' | 'stat' | 'day' | 'moat' | 'close'
 *   big       = a large hero number/amount (e.g. "3", "$8,460")
 *   brand     = true → the close renders the Kithova mark + wordmark lockup
 *   photoUrl  = a cached place-photo URL from the trip; photoName = that place (for the credit)
 */
import { dayVibe } from './tripCopy';
import { calcTripItineraryTotal } from './costs';
import { fmtM } from './helpers';
import { activityIcons } from '../theme';

// Cohesive brand gradients (each a 2-stop pair). Cover/close get the trip's own colors / ink.
const GRADS = {
  terracotta: ['#e86c3a', '#c8532a'],
  indigo:     ['#6c5ce7', '#4b3fae'],
  green:      ['#0e9f6e', '#0b7d57'],
  amber:      ['#e09a37', '#c8782a'],
  ink:        ['#2a211b', '#15110d'],   // premium dark — for the moat + close
};
const DAY_GRADS = [GRADS.terracotta, GRADS.indigo, GRADS.green, GRADS.amber];

const substantial = (a) => a.status !== 'skipped' && a.type !== 'note';

// A day's cached place photos, in day order → [{ url, name }]. Transport rows are skipped
// (a flight/drive photo isn't a "place").
function dayPhotos(d) {
  return (d.activities || [])
    .filter((x) => substantial(x) && x.type !== 'transport' && x.photo)
    .map((x) => ({ url: x.photo, name: x.name || null }));
}
// The first such photo on a day (or null) — used for the cover + each day's chapter card.
function dayPhoto(d) {
  return dayPhotos(d)[0] || null;
}

// How many of a day's photos the reel shows (the chapter card + up to PER_DAY_PHOTOS-1 extra
// photo slides), and an overall cap so a photo-heavy trip can't balloon into a 40-slide film.
const PER_DAY_PHOTOS = 3;
const MAX_DAY_SLIDES = 10;

// A day's emoji = its dominant activity type (a little visual variety per chapter).
function dayEmoji(d) {
  const acts = (d.activities || []).filter(substantial);
  if (!acts.length) return '🗓️';
  const counts = {};
  acts.forEach((a) => { counts[a.type] = (counts[a.type] || 0) + 1; });
  const top = Object.keys(counts).sort((x, y) => counts[y] - counts[x])[0];
  return activityIcons[top] || '📍';
}

// The four original music beds (see scripts/gen-music.js), in a fixed order.
export const SOUNDTRACKS = ['warm', 'wonder', 'dream', 'play'];

/**
 * Pick a soundtrack for a trip — deterministic, so each trip keeps its own "theme song" every
 * time you play it (a stable hash of the trip id/name over SOUNDTRACKS). Pure + testable; the
 * renderer maps the returned id → a bundled .wav.
 */
export function pickSoundtrack(trip) {
  const key = String(trip?.id || trip?.name || '');
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return SOUNDTRACKS[h % SOUNDTRACKS.length];
}

export function buildTripFilm(trip) {
  if (!trip) return [];
  const days = trip.days || [];
  const dayN = days.length;
  const fams = trip.families || [];
  const famN = fams.length;
  const people = fams.reduce((s, f) => s + (f.members?.length || 0), 0);
  const place = (trip.destination || '').split(',')[0].trim();
  const cover = Array.isArray(trip.bgColors) && trip.bgColors.length >= 2 ? trip.bgColors : GRADS.terracotta;

  const plannedDays = days.filter((d) => (d.activities || []).some(substantial));
  const stops = days.reduce((s, d) => s + (d.activities || []).filter((a) => substantial(a) && a.type !== 'transport').length, 0);
  const total = calcTripItineraryTotal(trip);
  const isTrailer = plannedDays.length === 0;
  const isVictory = dayN > 0 && plannedDays.length === dayN;

  // The cover leads with the trip's first cached place photo (most representative); gradient if none.
  const coverPhoto = days.map(dayPhoto).find(Boolean) || null;

  const slides = [];

  // ── COVER ── (the trip's own first place photo at render; gradient if none)
  slides.push({
    type: 'cover',
    grad: cover,
    emoji: trip.emoji || '🌍',
    photoUrl: coverPhoto?.url || null,
    photoName: coverPhoto?.name || null,
    title: trip.name || 'Our Trip',
    subtitle: [dayN ? `${dayN} ${dayN === 1 ? 'day' : 'days'}` : null, place || null].filter(Boolean).join('  ·  ') || null,
  });

  if (isTrailer) {
    // Barely started → one aspirational beat, no recap.
    slides.push({
      type: 'stat', grad: GRADS.indigo, emoji: '✨',
      title: 'Every great trip starts with one idea.',
      subtitle: place ? `${place}, here you come.` : null,
    });
  } else {
    // ── WHO ── everyone you travel with
    if (people) {
      slides.push({
        type: 'stat', grad: GRADS.indigo, big: `${people}`,
        title: famN >= 2 ? `${famN} families, together` : `${people} ${people === 1 ? 'traveler' : 'travelers'}`,
        subtitle: 'everyone you travel with',
      });
    }
    // ── WHAT ── days + stops
    slides.push({
      type: 'stat', grad: GRADS.green, big: `${plannedDays.length}`,
      title: `${plannedDays.length} ${plannedDays.length === 1 ? 'day' : 'days'} mapped out`,
      subtitle: stops ? `${stops} ${stops === 1 ? 'stop' : 'stops'} along the way` : (place || null),
    });
    // ── DAY chapters (capped) ── each day opens with a vibe line over its first place photo
    // (gradient if none), then a short reel of that day's other cached photos — so a well-
    // photographed day plays back like a montage, not a single card. Capped per day + overall.
    let daySlides = 0;
    plannedDays.slice(0, 4).forEach((d, k) => {
      const i = days.indexOf(d);
      const grad = DAY_GRADS[k % DAY_GRADS.length];
      const photos = dayPhotos(d).slice(0, PER_DAY_PHOTOS);
      // chapter opener: the vibe line over the day's first photo (or a gradient card)
      if (daySlides < MAX_DAY_SLIDES) {
        slides.push({ type: 'day', grad, kicker: `DAY ${i + 1}`, emoji: dayEmoji(d), photoUrl: photos[0]?.url || null, photoName: photos[0]?.name || null, title: dayVibe(d, i) });
        daySlides++;
      }
      // extra photo-forward slides for the day's other stops (captioned by place name)
      for (let p = 1; p < photos.length && daySlides < MAX_DAY_SLIDES; p++) {
        slides.push({ type: 'day', grad, kicker: `DAY ${i + 1}`, photoUrl: photos[p].url, photoName: photos[p].name, title: null });
        daySlides++;
      }
    });
    // ── THE MOAT ── the fair per-family split (only meaningful for 2+ families)
    if (famN >= 2) {
      slides.push({
        type: 'moat', grad: GRADS.ink, kicker: 'THE FAIR PART',
        big: total > 0 ? fmtM(total) : null,
        title: 'Split per family, automatically',
        subtitle: 'everyone knows exactly what they owe',
      });
    }
  }

  // ── CLOSE ── branded sign-off (the wordmark lockup, consistent with home + splash)
  slides.push({
    type: 'close', grad: GRADS.ink, brand: true,
    title: isVictory ? 'All set. ✨' : 'See you out there. ✨',
    subtitle: 'Easy to plan. Fun to travel. Fair to share.',
  });

  return slides;
}
