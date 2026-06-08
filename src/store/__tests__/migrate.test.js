/**
 * migrate.test.js — characterization net for the persist migration (store/migrate.js).
 *
 * Invariant #7: this function runs on EVERY shipped user's stored trips when they
 * update the app. A bug here is silent data loss. These tests pin every branch:
 * the backfills, the "existing value wins" rule, the nightPlan string→object widen,
 * the 24/7 openHours repair, idempotency (a re-run must be stable), and the empty
 * /null guards. They're deterministic — `deviceTz()` is the only impurity and we
 * only assert that the tz fields are backfilled to *some* string, never a literal.
 */
import { migratePersistedState } from '../migrate';

describe('migratePersistedState — upgrade-path safety (Invariant #7)', () => {
  test('null / undefined state is returned untouched (never throws)', () => {
    expect(migratePersistedState(undefined)).toBeUndefined();
    expect(migratePersistedState(null)).toBeNull();
  });

  test('missing trips array → normalised to []', () => {
    const out = migratePersistedState({});
    expect(out.trips).toEqual([]);
  });

  test('a legacy (v0) trip gets every new field backfilled', () => {
    const out = migratePersistedState({ trips: [{ id: 't1', name: 'Old Trip', days: [] }] });
    const t = out.trips[0];
    expect(t.seenPlaces).toEqual([]);
    expect(t.ignoredWarnings).toEqual([]);
    expect(t.origin).toBeNull();
    expect(t.expenses).toEqual([]);
    expect(t.packing).toEqual({});
    expect(typeof t.homeTz).toBe('string');
    expect(typeof t.defaultTz).toBe('string');
    // untouched original fields survive
    expect(t.id).toBe('t1');
    expect(t.name).toBe('Old Trip');
  });

  test('existing values ALWAYS win over the backfilled defaults (no clobber)', () => {
    const origin = { label: 'Home', lat: 1, lng: 2 };
    const expenses = [{ id: 'e1', amount: 10 }];
    const packing = { sunscreen: true };
    const out = migratePersistedState({
      trips: [{ id: 't1', origin, expenses, packing, homeTz: 'Europe/Paris', defaultTz: 'Asia/Tokyo', seenPlaces: ['p1'] }],
    });
    const t = out.trips[0];
    expect(t.origin).toBe(origin);
    expect(t.expenses).toBe(expenses);
    expect(t.packing).toBe(packing);
    expect(t.homeTz).toBe('Europe/Paris');
    expect(t.defaultTz).toBe('Asia/Tokyo');
    expect(t.seenPlaces).toEqual(['p1']);
  });

  test('day.nightPlan: string → { type }, object preserved, absent → undefined', () => {
    const objPlan = { type: 'friends', label: "Sam's place", lat: 1, lng: 2 };
    const out = migratePersistedState({
      trips: [{ id: 't1', days: [
        { label: 'Day 1', nightPlan: 'camping' },     // legacy string
        { label: 'Day 2', nightPlan: objPlan },        // already an object
        { label: 'Day 3' },                            // absent
      ] }],
    });
    const [d1, d2, d3] = out.trips[0].days;
    expect(d1.nightPlan).toEqual({ type: 'camping' });
    expect(d2.nightPlan).toBe(objPlan);
    expect(d3.nightPlan).toBeUndefined();
  });

  test('24/7 openHours repair: Sunday-only no-close expands to all 7 days', () => {
    const out = migratePersistedState({
      trips: [{ id: 't1', days: [{ activities: [
        { id: 'a', openHours: [{ d: 0, o: 0, c: 1440 }] }, // the broken 24/7 signature
      ] }] }],
    });
    const oh = out.trips[0].days[0].activities[0].openHours;
    expect(oh).toHaveLength(7);
    expect(oh).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, o: 0, c: 1440 })));
  });

  test('24/7 repair does NOT touch normal hours or hour-less activities', () => {
    const normal = [{ d: 1, o: 540, c: 1020 }]; // Mon 9–5, a real schedule
    const out = migratePersistedState({
      trips: [{ id: 't1', days: [{ activities: [
        { id: 'a', openHours: normal },
        { id: 'b' }, // no openHours at all
      ] }] }],
    });
    const [a, b] = out.trips[0].days[0].activities;
    expect(a.openHours).toBe(normal);
    expect(b).toEqual({ id: 'b' });
    expect(b.openHours).toBeUndefined();
  });

  test('idempotent: migrating twice yields the same shape (a re-run never corrupts)', () => {
    const once  = migratePersistedState({ trips: [{ id: 't1', days: [
      { nightPlan: 'camping', activities: [{ id: 'a', openHours: [{ d: 0, o: 0, c: 1440 }] }] },
    ] }] });
    const twice = migratePersistedState(JSON.parse(JSON.stringify(once)));
    expect(twice.trips[0]).toEqual(once.trips[0]);
  });

  test('a trip with no days array is handled (→ [])', () => {
    const out = migratePersistedState({ trips: [{ id: 't1' }] });
    expect(out.trips[0].days).toEqual([]);
  });

  test('a day with no activities array is handled (→ [])', () => {
    const out = migratePersistedState({ trips: [{ id: 't1', days: [{ label: 'Day 1' }] }] });
    expect(out.trips[0].days[0].activities).toEqual([]);
  });
});
