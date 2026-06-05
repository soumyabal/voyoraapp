/**
 * tripFilm.test.js — buildTripFilm turns a trip into a "Trip Wrapped" deck:
 * cover → who → days → the fair-split moat → a branded close. Photos come ONLY from the
 * trip's own cached place photos (act.photo) — no live fetch; gradient fallback per slide.
 * Pure/deterministic, state-adaptive (trailer / building / victory).
 */
import { buildTripFilm } from '../tripFilm';

const PHOTO = 'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=640&key=OLD';
const act = (id, name, type = 'activity', photo = null) => ({ id, name, type, time: '10:00', photo });
const last = (f) => f[f.length - 1];

describe('buildTripFilm (Trip Wrapped, cached photos)', () => {
  // 2 families, day 1 planned (Temple has a cached photo), days 2-3 empty (building mode).
  const building = {
    name: 'Bali', destination: 'Bali, Indonesia', emoji: '🌴',
    families: [
      { id: 'A', name: 'Sharma', members: [{ id: 'a1' }] },
      { id: 'B', name: 'Gupta', members: [{ id: 'b1' }, { id: 'b2' }] },
    ],
    days: [
      { label: 'Day 1', date: '2026-07-10', activities: [act('p1', 'Beach Club', 'food'), act('p2', 'Temple', 'activity', PHOTO)] },
      { label: 'Day 2', date: '2026-07-11', activities: [] },
      { label: 'Day 3', date: '2026-07-12', activities: [] },
    ],
  };

  test('opens on a cover, closes on a branded sign-off with the tagline', () => {
    const f = buildTripFilm(building);
    expect(f[0].type).toBe('cover');
    expect(f[0].title).toBe('Bali');
    expect(f[0].emoji).toBe('🌴');
    expect(last(f).type).toBe('close');
    expect(last(f).brand).toBe(true);
    expect(last(f).subtitle).toMatch(/fair to share/i);
  });

  test('every slide has a gradient fallback; non-photo beats carry no photoUrl', () => {
    const f = buildTripFilm(building);
    f.forEach((s) => expect(Array.isArray(s.grad) && s.grad.length >= 2).toBe(true));
    // stat / moat / close never carry a photo — only cover + day cards do.
    f.filter((s) => ['stat', 'moat', 'close'].includes(s.type))
      .forEach((s) => expect(s.photoUrl == null).toBe(true));
  });

  test("the cover carries the trip's first cached place photo (url + name)", () => {
    const cover = buildTripFilm(building)[0];
    expect(cover.photoUrl).toBe(PHOTO);
    expect(cover.photoName).toBe('Temple');
  });

  test('has who + days stats and the fair-split moat (2+ families)', () => {
    const f = buildTripFilm(building);
    expect(f.some((s) => s.type === 'stat' && /families, together/.test(s.title))).toBe(true);
    expect(f.some((s) => s.type === 'stat' && /mapped out/.test(s.title))).toBe(true);
    const moat = f.filter((s) => s.type === 'moat');
    expect(moat).toHaveLength(1);
    expect(moat[0].subtitle).toMatch(/what they owe/);
  });

  test("one day card per planned day (capped at 4), each with a vibe line + that day's cached photo", () => {
    const f = buildTripFilm(building);
    const dayCards = f.filter((s) => s.type === 'day');
    expect(dayCards).toHaveLength(1);            // only Day 1 is planned
    expect(dayCards[0].kicker).toBe('DAY 1');
    expect(typeof dayCards[0].title).toBe('string');
    expect(dayCards[0].title.length).toBeGreaterThan(0);
    expect(dayCards[0].photoUrl).toBe(PHOTO);
    expect(dayCards[0].photoName).toBe('Temple');
  });

  test('a planned day with no cached photo → day card has no photoUrl (gradient)', () => {
    const noPhoto = {
      ...building,
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [act('p1', 'Market', 'food')] }],
    };
    const card = buildTripFilm(noPhoto).find((s) => s.type === 'day');
    expect(card.photoUrl).toBeNull();
    expect(buildTripFilm(noPhoto)[0].photoUrl).toBeNull();   // and so does the cover
  });

  test('a cached photo on a transport row is not used (it is not a place)', () => {
    const flightOnly = {
      ...building,
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [act('t1', 'Flight', 'transport', PHOTO)] }],
    };
    expect(buildTripFilm(flightOnly)[0].photoUrl).toBeNull();
  });

  test('solo trip (1 family) → no moat beat', () => {
    const solo = { ...building, families: [{ id: 'A', members: [{ id: 'a1' }] }] };
    expect(buildTripFilm(solo).some((s) => s.type === 'moat')).toBe(false);
  });

  test('victory mode: every day planned → celebratory close', () => {
    const victory = {
      name: 'Daytrip', destination: 'San Francisco', emoji: '🌉',
      families: [{ id: 'A', members: [{ id: 'a1' }] }],
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [act('p1', 'Pier'), act('p2', 'Park')] }],
    };
    expect(last(buildTripFilm(victory)).title).toBe('All set. ✨');
  });

  test('trailer mode: nothing planned → one aspiration beat, no day cards, no moat, close last', () => {
    const trailer = {
      name: 'New trip', destination: 'Rome', emoji: '🏛️',
      families: [{ id: 'A', members: [{ id: 'a1' }] }],
      days: [{ label: 'Day 1', date: '2026-07-10', activities: [] }, { label: 'Day 2', date: '2026-07-11', activities: [] }],
    };
    const f = buildTripFilm(trailer);
    expect(f.some((s) => s.type === 'day')).toBe(false);
    expect(f.some((s) => s.type === 'moat')).toBe(false);
    expect(f[1].title).toMatch(/starts with one idea/);
    expect(last(f).type).toBe('close');
  });

  test('pure + deterministic — same trip, same film (no Date/random)', () => {
    expect(buildTripFilm(building)).toEqual(buildTripFilm(building));
  });
});
