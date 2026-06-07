/**
 * tripsSlice — trip CRUD + per-trip flags (seen places, distance cache, ignored
 * warnings, night plans).
 *
 * Part of the Zustand slices split: a `(set, get) => ({...actions})` factory
 * spread into the single persisted store in ../index.js. set/get operate on the
 * FULL merged store, so behaviour is identical to the former inline definitions.
 * The `trips` state itself is declared in ../index.js.
 *
 * Gated by: store.test (createTrip shape + day generation + persisted-shape guard).
 */
import { uid, TRIP_EMOJIS, TRIP_BG_COLORS, familyPalette } from '../../utils/helpers';
import { deviceTz, tzForCoords } from '../../utils/tz';

export const createTripsSlice = (set, get) => ({
  // ── TRIPS ───────────────────────────────────────────────
  addTrip: (trip) => set(s => ({ trips: [trip, ...s.trips] })),

  deleteTrip: (tripId) => set(s => ({
    trips: s.trips.filter(t => t.id !== tripId),
    currentTripId: s.currentTripId === tripId ? null : s.currentTripId,
  })),

  updateTrip: (tripId, updates) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const next = { ...t, ...updates };
      // Keep the trip's default zone in sync with where it STARTS: when the origin gains
      // coords (and the caller didn't explicitly set a zone), infer defaultTz from them.
      if (updates.origin?.lat != null && updates.defaultTz === undefined) {
        next.defaultTz = tzForCoords(updates.origin.lat, updates.origin.lng) || next.defaultTz || null;
      }
      return next;
    }),
  })),

  // Resize a trip to a new date range, PRESERVING content by day-index. The first N days keep
  // their activities/night-plans (re-dated + re-labelled); extra days beyond the new range are
  // dropped; extending appends empty days. Expenses linked to a DROPPED activity are removed;
  // manual expenses and expenses for surviving activities are kept. (The generic updateTrip
  // never touches days — this is the one deliberate, data-aware resize path. See EditTripModal,
  // which warns before a shrink that loses data.)
  resizeTripDates: (tripId, startDate, endDate) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const dates = [];
      for (let d = new Date(startDate + 'T00:00:00'); d <= new Date(endDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      if (!dates.length) return t;   // invalid range → leave the trip untouched
      const old = t.days || [];
      const days = dates.map((date, i) => ({ ...(old[i] || { activities: [] }), label: `Day ${i + 1}`, date }));
      const survivingActIds = new Set(days.flatMap(d => (d.activities || []).map(a => a.id)));
      const expenses = (t.expenses || []).filter(e => !e.activityId || survivingActIds.has(e.activityId));
      return { ...t, startDate, endDate, days, expenses };
    }),
  })),

  duplicateTrip: (tripId) => set(s => {
    const orig = s.trips.find(t => t.id === tripId);
    if (!orig) return s;
    const newTrip = {
      ...orig,
      id: uid(),
      name: `Copy of ${orig.name}`,
      expenses: [],
      itineraryPushed: false,
      families: orig.families.map(f => ({
        ...f, id: uid(),
        members: f.members.map(m => ({ ...m, id: uid() })),
      })),
      days: orig.days.map(d => ({
        ...d,
        activities: d.activities.map(a => ({ ...a, id: uid() })),
      })),
    };
    return { trips: [newTrip, ...s.trips] };
  }),

  createTrip: ({ name, destination, startDate, endDate, mode, pace = 'moderate', budget = 'mid-range', focus = [], familyForms = [], skipDefaultFamily = false, origin = null }) => {
    const families = familyForms
      .filter(ff => ff.name || ff.members.some(m => m.name))
      .map((ff, fi) => ({
        id: uid(),
        name: ff.name || `Family ${fi + 1}`,
        color: familyPalette[fi % familyPalette.length],
        members: ff.members
          .filter(m => m.name)
          .map(m => ({ id: uid(), name: m.name, age: parseInt(m.age) || 25, needs: [] })),
      }));

    if (families.length === 0 && !skipDefaultFamily) {
      families.push({ id: uid(), name: 'My Family', color: familyPalette[0], members: [{ id: uid(), name: 'Traveler 1', age: 30, needs: [] }] });
    }
    if (families.some(f => f.members.length === 0)) {
      families.forEach(f => { if (!f.members.length) f.members.push({ id: uid(), name: 'Traveler', age: 30, needs: [] }); });
    }

    const days = [];
    for (let d = new Date(startDate + 'T00:00:00'), i = 1; d <= new Date(endDate + 'T00:00:00'); d.setDate(d.getDate() + 1), i++) {
      days.push({ label: `Day ${i}`, date: d.toISOString().slice(0, 10), activities: [] });
    }

    const trip = {
      id: uid(),
      name, destination,
      emoji: TRIP_EMOJIS[Math.floor(Math.random() * TRIP_EMOJIS.length)],
      startDate, endDate, mode,
      pace, budget, focus,
      splitMode: 'family', // 'individual' | 'family' — Voyara is multi-family-first, so default to By Group
      bgColors: TRIP_BG_COLORS[Math.floor(Math.random() * TRIP_BG_COLORS.length)],
      itineraryPushed: false,
      families, days, expenses: [],
      seenPlaces: [],   // Discover places opened on the web (persisted)
      // Where Day 1 begins (arrival airport / hotel / home) → anchors the
      // first stop's travel leg + auto-arrange. { label, lat, lng } | null.
      origin: origin && origin.label ? origin : null,
      // Timezones (docs/timezone-model.md): homeTz = the traveler's own zone (for "now" +
      // pre-trip planning); defaultTz = the destination's zone, the fallback for every day
      // (each day may override via day.tz). Inferred from the origin's coords when known at
      // creation, else the device zone; kept in sync by updateTrip when the origin changes.
      homeTz: deviceTz(),
      defaultTz: (origin && origin.lat != null ? tzForCoords(origin.lat, origin.lng) : null) || deviceTz() || null,
    };

    set(s => ({ trips: [trip, ...s.trips] }));
    return trip;
  },

  // Mark a Discover place as "seen" (opened on the web) — persisted per trip so
  // it stays greyed/de-emphasised across sessions, not just the current one.
  markPlaceSeen: (tripId, name) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId || !name) return t;
      const seen = t.seenPlaces || [];
      return seen.includes(name) ? t : { ...t, seenPlaces: [...seen, name] };
    }),
  })),

  // Clear all "seen on web" marks for a trip — a fresh browse.
  clearSeenPlaces: (tripId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : { ...t, seenPlaces: [] }),
  })),

  // ── DISTANCE CACHE ──────────────────────────────────────
  updateDistanceCache: (tripId, cache) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : { ...t, distanceCache: cache }),
  })),

  clearDistanceCache: (tripId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : { ...t, distanceCache: null }),
  })),

  // ── IGNORED WARNINGS ────────────────────────────────────
  // Key format: `${type}:${dayIndex ?? 'trip'}` — stable per warning type + day
  ignoreWarning: (tripId, warningKey) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      ignoredWarnings: [...new Set([...(t.ignoredWarnings || []), warningKey])],
    }),
  })),
  clearIgnoredWarnings: (tripId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      ignoredWarnings: [],
    }),
  })),

  // ── NIGHT PLAN (hotel-less but covered) ─────────────────
  // How an un-booked night is handled, as an object:
  //   { type:'overnight_travel'|'with_friends'|'camping'|'heading_home',
  //     label?, lat?, lng? }   (or null to clear)
  // Stored per-DAY. lodgingForNight reads it so unbooked_night stops nagging,
  // and an optional address (friends/camping) anchors the next morning's drive.
  setNightPlan: (tripId, dayIndex, plan) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      days: t.days.map((d, i) => i !== dayIndex ? d : { ...d, nightPlan: plan || null }),
    }),
  })),
});
