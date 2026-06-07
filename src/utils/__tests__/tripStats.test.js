/**
 * tripStats.test.js — the "Trip Wrapped" recap stats engine. Pure + deterministic.
 */
import { computeTripStats, tripStatLines } from '../tripStats';

const LAX = { lat: 33.9416, lng: -118.4085 };  // Pacific
const ORD = { lat: 41.9742, lng: -87.9073 };   // Central
const A = (name, type, extra = {}) => ({ id: name, name, type, status: null, ...extra });

const trip = {
  homeTz: 'America/Chicago', defaultTz: 'America/Chicago',
  startDate: '2026-07-10', endDate: '2026-07-12',
  families: [{ id: 'f', members: [{ id: 'm', name: 'A', age: 30 }] }],
  days: [
    { label: 'Day 1', date: '2026-07-10', activities: [
      A('Flight ORD → LAX', 'transport', { subtype: 'flight', ...LAX }),
      A('Lunch', 'food', { city: 'Los Angeles', ...LAX }),
      A('Hotel', 'stay', { city: 'Los Angeles', ...LAX }),
    ] },
    { label: 'Day 2', date: '2026-07-11', activities: [
      A('Museum', 'activity', { city: 'Los Angeles', ...LAX }),
      A('Beach', 'activity', { city: 'Los Angeles', ...LAX }),
      A('Dinner', 'food', { city: 'Los Angeles', ...LAX }),
      A('Skip me', 'activity', { status: 'skipped', ...LAX }),
    ] },
    { label: 'Day 3', date: '2026-07-12', activities: [
      A('Flight LAX → ORD', 'transport', { subtype: 'flight', ...ORD }),
    ] },
  ],
  expenses: [
    { id: 'e1', source: 'itinerary', amount: 100, excluded: false },
    { id: 'e2', source: 'manual', amount: 50, excluded: false },
  ],
};

describe('computeTripStats', () => {
  const s = computeTripStats(trip);

  test('counts days, nights, places (excludes transport/notes/skipped)', () => {
    expect(s.days).toBe(3);
    expect(s.nights).toBe(2);
    // places = activity+food+stay, non-skipped: lunch, hotel, museum, beach, dinner = 5
    expect(s.placesCount).toBe(5);
  });

  test('tallies cities + types + transport modes', () => {
    expect(s.cityCount).toBe(1);
    expect(s.cities).toEqual(['Los Angeles']);
    expect(s.byType.food).toBe(2);
    expect(s.byType.activity).toBe(2);   // skipped one excluded
    expect(s.flights).toBe(2);
    expect(s.drives).toBe(0);
  });

  test('spans 2 time zones (Central + Pacific) from the located stops', () => {
    expect(s.timezoneCount).toBe(2);
  });

  test('busiest day is Day 2 (3 non-stay stops)', () => {
    expect(s.busiestDay.index).toBe(1);
    expect(s.busiestDay.count).toBe(3);
  });

  test('total spend sums non-excluded expenses', () => {
    expect(s.totalSpend).toBe(150);
    expect(s.hasSpend).toBe(true);
  });

  test('an empty trip is handled gracefully', () => {
    const e = computeTripStats({ days: [] });
    expect(e.days).toBe(0);
    expect(e.placesCount).toBe(0);
    expect(e.timezoneCount).toBe(0);
    expect(e.hasSpend).toBe(false);
  });
});

describe('computeTripStats — per-family spend (reuses the moat math)', () => {
  const twoFam = {
    families: [
      { id: 'fa', name: 'Aye', color: '#a00', members: [{ id: 'a1', name: 'A1' }] },
      { id: 'fb', name: 'Bee', color: '#0a0', members: [{ id: 'b1', name: 'B1' }] },
    ],
    days: [{ label: 'Day 1', date: '2026-07-10', activities: [] }],
    expenses: [
      // A $100 family-split expense shared by both families → $50 each.
      { id: 'e', source: 'manual', amount: 100, excluded: false, splitMode: 'family',
        participatingFamilies: ['fa', 'fb'], participatingMembers: null, paidBy: 'a1' },
    ],
  };

  test('splits per family and flags the top spender', () => {
    const s = computeTripStats(twoFam);
    expect(s.perFamily).toHaveLength(2);
    const byId = Object.fromEntries(s.perFamily.map(p => [p.id, p.total]));
    expect(byId.fa).toBeCloseTo(50, 2);
    expect(byId.fb).toBeCloseTo(50, 2);
    expect(s.topSpender.id).toBeTruthy();
  });

  test('no families / no expenses → empty perFamily, null topSpender', () => {
    const s = computeTripStats({ days: [] });
    expect(s.perFamily).toEqual([]);
    expect(s.topSpender).toBeNull();
  });
});

describe('tripStatLines', () => {
  test('produces human one-liners incl. zones, flights, spend', () => {
    const lines = tripStatLines(computeTripStats(trip));
    expect(lines.some(l => /5 places across 1 city/.test(l))).toBe(true);
    expect(lines.some(l => /Crossed 2 time zones/.test(l))).toBe(true);
    expect(lines.some(l => /2 flights/.test(l))).toBe(true);
    expect(lines.some(l => /\$150 shared/.test(l))).toBe(true);
  });
});
