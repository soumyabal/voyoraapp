/**
 * Tests for the auto-arrange engine (src/utils/autoArrange.js).
 *
 * The engine is a pure, deterministic function, so these are plain logic
 * tests — no React Native, no store, no network. They lock the behaviour
 * verified during build, including the two bugs fixed in Phase A:
 *   - no pre-dawn (00:00) times
 *   - a second city opens a fresh day instead of topping up the current one
 */
import { autoArrange } from '../autoArrange';
import { timeToMin } from '../slots';

// ── Fixtures ──────────────────────────────────────────────────────
const emptyDays = (n) =>
  Array.from({ length: n }, (_, i) => ({ label: `Day ${i + 1}`, date: `2026-07-${10 + i}`, activities: [] }));

const trip = (over = {}) => ({
  id: 't1', destination: 'Test', pace: 'moderate', families: [], days: emptyDays(4), ...over,
});

// Discover-shaped place
const P = (name, type, lat, lng, city, cost = 10, hint) => ({
  name, activityType: type, lat, lng, city, costPerPerson: cost,
  address: `${name}, ${city}`, rating: 4.5, url: '', types: [], ...(hint ? { _hint: hint } : {}),
});

const flat = (r) => r.placements.flat();
const citiesOnDay = (acts) => new Set(acts.filter(a => a.city).map(a => a.city));

// ── Tests ─────────────────────────────────────────────────────────
describe('autoArrange', () => {
  it('places a mixed basket and returns a clean summary', () => {
    const basket = [
      P('Rice Terraces', 'activity', -8.43, 115.28, 'Ubud'),
      P('Monkey Forest', 'activity', -8.52, 115.26, 'Ubud'),
      P('Warung Lunch', 'food', -8.51, 115.26, 'Ubud', 14),
    ];
    const r = autoArrange(basket, trip());
    expect(flat(r)).toHaveLength(3);
    expect(r.unplaced).toHaveLength(0);
    expect(r.summary.placed).toBe(3);
  });

  it('never assigns a pre-dawn time (00:00 regression)', () => {
    // Two morning-ish items in one city on a single day used to fill the
    // pre-dawn gap at 00:00. Every placed time must be >= 09:00.
    const basket = [
      P('A', 'activity', -8.5, 115.2, 'X'),
      P('B', 'activity', -8.5, 115.2, 'X'),
      P('C', 'activity', -8.5, 115.2, 'X'),
    ];
    const r = autoArrange(basket, trip({ days: emptyDays(1), pace: 'packed' }));
    for (const a of flat(r)) {
      expect(timeToMin(a.time)).toBeGreaterThanOrEqual(timeToMin('09:00'));
    }
  });

  it('does not mix two cities on the same day (clustering regression)', () => {
    const basket = [
      P('U1', 'activity', -8.43, 115.28, 'Ubud'),
      P('U2', 'activity', -8.52, 115.26, 'Ubud'),
      P('S1', 'activity', -8.62, 115.08, 'Seminyak'),
      P('S2', 'activity', -8.68, 115.15, 'Seminyak'),
    ];
    const r = autoArrange(basket, trip());
    r.placements.forEach(acts => {
      if (acts.length) expect(citiesOnDay(acts).size).toBeLessThanOrEqual(1);
    });
  });

  it('spans a multi-day venue across the requested number of days', () => {
    const basket = [P('Disneyland', 'activity', 33.81, -117.92, 'Anaheim', 150, { dayCount: 2 })];
    const r = autoArrange(basket, trip({ days: emptyDays(5) }));
    const instances = flat(r).filter(a => a.name === 'Disneyland');
    expect(instances).toHaveLength(2);
    expect(instances.every(a => a.repeatIntent)).toBe(true);
    // on two distinct days
    const dayIdxs = r.placements.flatMap((acts, i) => acts.some(a => a.name === 'Disneyland') ? [i] : []);
    expect(new Set(dayIdxs).size).toBe(2);
  });

  it('honours a pinDay hint', () => {
    const basket = [P('Concert', 'activity', 34, -118, 'LA', 80, { pinDay: 2 })];
    const r = autoArrange(basket, trip());
    expect(r.placements[2].some(a => a.name === 'Concert')).toBe(true);
  });

  it('merges around existing activities without moving or including them', () => {
    const withFlight = trip({
      days: [
        { label: 'Day 1', date: '2026-07-10', activities: [
          { id: 'flight', type: 'transport', time: '08:00', name: 'Flight', costPerPerson: 300 }, // ~120m → ends 10:00
        ] },
        ...emptyDays(2).slice(0, 1).map((d, i) => ({ ...d, label: 'Day 2', date: '2026-07-11' })),
      ],
    });
    const r = autoArrange([P('Temple', 'activity', 1, 1, 'C')], withFlight);
    // existing activity is never part of the returned drafts
    expect(flat(r).some(a => a.id === 'flight' || a.name === 'Flight')).toBe(false);
    // the new item is scheduled after the existing flight ends (10:00)
    const temple = flat(r).find(a => a.name === 'Temple');
    expect(temple).toBeTruthy();
    expect(timeToMin(temple.time)).toBeGreaterThanOrEqual(timeToMin('10:00'));
  });

  it('reports overflow in unplaced instead of dropping silently', () => {
    const basket = Array.from({ length: 6 }, (_, i) => P(`Spot ${i}`, 'activity', null, null, 'C'));
    const r = autoArrange(basket, trip({ days: emptyDays(1), pace: 'relaxed' })); // cap 3
    expect(flat(r).length + r.unplaced.length).toBe(6);
    expect(r.unplaced.length).toBeGreaterThan(0);
  });

  it('produces drafts that satisfy the store/UI data contract', () => {
    const r = autoArrange([P('X', 'activity', 1, 1, 'C', 20), P('Y', 'food', 1, 1, 'C', 12)], trip());
    for (const a of flat(r)) {
      expect(a._draftId).toBeTruthy();             // stable React key for the preview
      expect(a.time).toMatch(/^\d\d:\d\d$/);       // concrete time
      expect(['activity', 'food', 'stay']).toContain(a.type);
      expect(a.name).toBeTruthy();
      expect(typeof a.costPerPerson).toBe('number'); // preserved for expense sync
    }
  });

  it('handles empty input safely', () => {
    expect(autoArrange([], trip()).summary.placed).toBe(0);
    const noDays = autoArrange([P('X', 'activity', 1, 1, 'C')], trip({ days: [] }));
    expect(noDays.unplaced).toHaveLength(1);
  });
});
