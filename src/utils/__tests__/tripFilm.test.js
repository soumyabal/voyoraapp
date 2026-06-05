/**
 * tripFilm.test.js — buildTripFilm turns a trip into a PHOTO-FREE "Trip Wrapped" deck:
 * cover → who → days → the fair-split moat → a branded close. No Google imagery (legal),
 * pure/deterministic, state-adaptive (trailer / building / victory).
 */
import { buildTripFilm } from '../tripFilm';

const act = (id, name, type = 'activity') => ({ id, name, type, time: '10:00' });
const last = (f) => f[f.length - 1];

describe('buildTripFilm (photo-free Trip Wrapped)', () => {
  // 2 families, day 1 planned, days 2-3 empty (building mode).
  const building = {
    name: 'Bali', destination: 'Bali, Indonesia', emoji: '🌴',
    families: [
      { id: 'A', name: 'Sharma', members: [{ id: 'a1' }] },
      { id: 'B', name: 'Gupta', members: [{ id: 'b1' }, { id: 'b2' }] },
    ],
    days: [
      { label: 'Day 1', date: '2026-07-10', activities: [act('p1', 'Beach Club', 'food'), act('p2', 'Temple')] },
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
    expect(last(f).subtitle).toMatch(/shared memories/i);
  });

  test('uses NO photos / Google imagery — every slide is a gradient card', () => {
    const f = buildTripFilm(building);
    expect(f.some((s) => s.type === 'photo' || s.uri || s.heroUri)).toBe(false);
    f.forEach((s) => expect(Array.isArray(s.grad) && s.grad.length >= 2).toBe(true));
  });

  test('has who + days stats and the fair-split moat (2+ families)', () => {
    const f = buildTripFilm(building);
    expect(f.some((s) => s.type === 'stat' && /families, together/.test(s.title))).toBe(true);
    expect(f.some((s) => s.type === 'stat' && /mapped out/.test(s.title))).toBe(true);
    const moat = f.filter((s) => s.type === 'moat');
    expect(moat).toHaveLength(1);
    expect(moat[0].subtitle).toMatch(/what they owe/);
  });

  test('one day card per planned day (capped at 4), each with a vibe line', () => {
    const f = buildTripFilm(building);
    const dayCards = f.filter((s) => s.type === 'day');
    expect(dayCards).toHaveLength(1);            // only Day 1 is planned
    expect(dayCards[0].kicker).toBe('DAY 1');
    expect(typeof dayCards[0].title).toBe('string');
    expect(dayCards[0].title.length).toBeGreaterThan(0);
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
