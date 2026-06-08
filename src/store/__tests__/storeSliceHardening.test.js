/**
 * storeSliceHardening.test.js — coverage net for the trips/activities slice actions
 * NOT already gated by store.test / storeActions / splitDelete.
 *
 * storeActions pins the money-cascade (add/update/delete/move/skip/arrange/plan);
 * store.test pins createTrip + resizeTripDates + togglePackingItem. This file locks
 * the remaining launch-relevant behaviours: duplicateTrip's deep-copy integrity (a
 * shared object ref across two trips would corrupt data), the reset/clear paths that
 * must preserve MANUAL expenses, the live Move-menu reorder (drag is parked in Expo
 * Go), the time-lock toggle that Plan-my-day honours, night plans, ignored-warning
 * dedup, and origin→defaultTz inference. Additive — locks current behaviour only.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../index';
import { tzForCoords } from '../../utils/tz';

const S = () => useStore.getState();
const tripById = id => S().trips.find(t => t.id === id);

function makeTrip(extra = {}) {
  return S().createTrip({
    name: 'Slice', destination: 'X', startDate: '2026-06-12', endDate: '2026-06-14', mode: 'manual',
    familyForms: [{ name: 'Aye', members: [{ name: 'A1', age: '30' }, { name: 'A2', age: '8' }] }],
    ...extra,
  });
}
const addDinner = (id, day = 0, cpp = 10) =>
  S().addActivity(id, day, { type: 'food', name: 'Dinner', time: '19:00', costPerPerson: cpp });

// ─────────────────────────── trips slice ───────────────────────────

describe('duplicateTrip — deep-copy integrity', () => {
  test('copies with fresh ids, cleared expenses, and NO shared object refs', () => {
    const t = makeTrip();
    addDinner(t.id);                       // creates an activity + auto-funds an expense
    const orig = tripById(t.id);
    expect(orig.expenses.length).toBe(1);

    S().duplicateTrip(t.id);
    const copy = S().trips.find(x => x.name === `Copy of ${orig.name}`);

    expect(copy).toBeTruthy();
    expect(copy.id).not.toBe(orig.id);
    expect(copy.expenses).toEqual([]);          // money is NOT carried into a copy
    expect(copy.itineraryPushed).toBe(false);
    // fresh ids all the way down
    expect(copy.families[0].id).not.toBe(orig.families[0].id);
    expect(copy.families[0].members[0].id).not.toBe(orig.families[0].members[0].id);
    expect(copy.days[0].activities[0].id).not.toBe(orig.days[0].activities[0].id);
    // and distinct object references (mutating one can't bleed into the other)
    expect(copy.days[0].activities[0]).not.toBe(orig.days[0].activities[0]);
    expect(copy.families[0].members[0]).not.toBe(orig.families[0].members[0]);
  });

  test('mutating the copy does not affect the original', () => {
    const t = makeTrip();
    addDinner(t.id);
    const origName = tripById(t.id).name;
    S().duplicateTrip(t.id);
    const copy = S().trips.find(x => x.name === `Copy of ${origName}`);
    const copyActId = copy.days[0].activities[0].id;

    S().updateActivity(copy.id, copyActId, { name: 'Brunch' });

    expect(tripById(copy.id).days[0].activities[0].name).toBe('Brunch');
    expect(tripById(t.id).days[0].activities[0].name).toBe('Dinner'); // original untouched
  });

  test('unknown tripId is a no-op', () => {
    const before = S().trips.length;
    S().duplicateTrip('ghost');
    expect(S().trips.length).toBe(before);
  });
});

describe('deleteTrip — current-trip pointer hygiene', () => {
  test('deleting the CURRENT trip clears currentTripId', () => {
    const t = makeTrip();
    useStore.setState({ currentTripId: t.id });
    S().deleteTrip(t.id);
    expect(tripById(t.id)).toBeUndefined();
    expect(S().currentTripId).toBeNull();
  });

  test('deleting a non-current trip leaves currentTripId intact', () => {
    const keep = makeTrip();
    const gone = makeTrip();
    useStore.setState({ currentTripId: keep.id });
    S().deleteTrip(gone.id);
    expect(S().currentTripId).toBe(keep.id);
  });
});

describe('per-trip flags', () => {
  test('setNightPlan sets then clears a day night plan', () => {
    const t = makeTrip();
    S().setNightPlan(t.id, 1, { type: 'with_friends', label: "Sam's" });
    expect(tripById(t.id).days[1].nightPlan).toEqual({ type: 'with_friends', label: "Sam's" });
    S().setNightPlan(t.id, 1, null);
    expect(tripById(t.id).days[1].nightPlan).toBeNull();
  });

  test('ignoreWarning dedups; clearIgnoredWarnings empties', () => {
    const t = makeTrip();
    S().ignoreWarning(t.id, 'packed:1');
    S().ignoreWarning(t.id, 'packed:1');   // dup
    S().ignoreWarning(t.id, 'no_meal:0');
    expect(tripById(t.id).ignoredWarnings.sort()).toEqual(['no_meal:0', 'packed:1']);
    S().clearIgnoredWarnings(t.id);
    expect(tripById(t.id).ignoredWarnings).toEqual([]);
  });

  test('markPlaceSeen dedups + guards empty; clearSeenPlaces empties', () => {
    const t = makeTrip();
    S().markPlaceSeen(t.id, 'Louvre');
    S().markPlaceSeen(t.id, 'Louvre');     // dup
    S().markPlaceSeen(t.id, '');           // guarded
    expect(tripById(t.id).seenPlaces).toEqual(['Louvre']);
    S().clearSeenPlaces(t.id);
    expect(tripById(t.id).seenPlaces).toEqual([]);
  });

  test('updateTrip infers defaultTz from a new origin with coords', () => {
    const t = makeTrip();
    const origin = { label: 'San Diego', lat: 32.7157, lng: -117.1611 };
    S().updateTrip(t.id, { origin });
    expect(tripById(t.id).defaultTz).toBe(tzForCoords(origin.lat, origin.lng));
  });

  test('updateTrip does NOT override an explicitly provided defaultTz', () => {
    const t = makeTrip();
    S().updateTrip(t.id, { origin: { label: 'SD', lat: 32.7157, lng: -117.1611 }, defaultTz: 'Asia/Tokyo' });
    expect(tripById(t.id).defaultTz).toBe('Asia/Tokyo');
  });
});

// ───────────────────────── activities slice ─────────────────────────

describe('reset paths preserve MANUAL expenses', () => {
  test('resetAllActivities clears days, drops itinerary expenses, keeps manual, resets flags', () => {
    const t = makeTrip();
    addDinner(t.id);                                   // itinerary expense (source:'itinerary')
    S().addExpense(t.id, { name: 'Cash tip', amount: 20, category: '🍽️', paidBy: tripById(t.id).families[0].members[0].id });
    expect(tripById(t.id).itineraryPushed).toBe(true);

    S().resetAllActivities(t.id);
    const after = tripById(t.id);
    expect(after.days.every(d => d.activities.length === 0)).toBe(true);
    expect(after.itineraryPushed).toBe(false);
    expect(after.budgetByFamily).toEqual([]);
    expect(after.expenses.some(e => e.source === 'itinerary')).toBe(false); // itinerary gone
    expect(after.expenses.some(e => e.name === 'Cash tip')).toBe(true);     // manual kept
  });

  test('resetDayActivities clears one day only and re-syncs itinerary expenses', () => {
    const t = makeTrip();
    addDinner(t.id, 0);
    addDinner(t.id, 1);
    expect(tripById(t.id).expenses.length).toBe(2);
    S().resetDayActivities(t.id, 0);
    const after = tripById(t.id);
    expect(after.days[0].activities).toEqual([]);
    expect(after.days[1].activities.length).toBe(1);   // other day untouched
    expect(after.expenses.length).toBe(1);             // day-0's itinerary expense removed
  });
});

describe('reorder paths (the live Move-menu reorder — drag is parked in Expo Go)', () => {
  test('reorderActivity swaps neighbours and guards the ends', () => {
    const t = makeTrip();
    S().addActivity(t.id, 0, { type: 'activity', name: 'First', time: '09:00' });
    S().addActivity(t.id, 0, { type: 'activity', name: 'Second', time: '10:00' });
    const ids = tripById(t.id).days[0].activities.map(a => a.id);

    S().reorderActivity(t.id, 0, ids[1], -1); // move Second up
    expect(tripById(t.id).days[0].activities.map(a => a.name)).toEqual(['Second', 'First']);

    S().reorderActivity(t.id, 0, ids[1], -1); // already at top → no-op
    expect(tripById(t.id).days[0].activities.map(a => a.name)).toEqual(['Second', 'First']);
  });

  test('reorderSlotActivities reassigns times to the dragged order', () => {
    const t = makeTrip();
    S().addActivity(t.id, 0, { type: 'activity', name: 'Morning', time: '09:00' });
    S().addActivity(t.id, 0, { type: 'activity', name: 'Noon', time: '12:00' });
    const acts = tripById(t.id).days[0].activities;
    const noonId = acts.find(a => a.name === 'Noon').id;
    const morningId = acts.find(a => a.name === 'Morning').id;

    // drag Noon before Morning → Noon should take the earlier time
    S().reorderSlotActivities(t.id, 0, [noonId, morningId]);
    const after = tripById(t.id).days[0].activities;
    expect(after.find(a => a.name === 'Noon').time).toBe('09:00');
    expect(after.find(a => a.name === 'Morning').time).toBe('12:00');
  });
});

describe('toggleActivityLock — the Plan-my-day anchor', () => {
  test('flips timeLocked on the targeted activity', () => {
    const t = makeTrip();
    S().addActivity(t.id, 0, { type: 'activity', name: 'Tour', time: '10:00' });
    const actId = tripById(t.id).days[0].activities[0].id;
    expect(tripById(t.id).days[0].activities[0].timeLocked).toBeFalsy();
    S().toggleActivityLock(t.id, actId);
    expect(tripById(t.id).days[0].activities[0].timeLocked).toBe(true);
    S().toggleActivityLock(t.id, actId);
    expect(tripById(t.id).days[0].activities[0].timeLocked).toBe(false);
  });
});

describe('applyArrangedActivities — auto-arrange merge', () => {
  test('strips draft fields, assigns ids, appends to days, funds costed stops when pushed', () => {
    const t = makeTrip();
    addDinner(t.id);                                    // makes itineraryPushed = true
    const expensesBefore = tripById(t.id).expenses.length;

    S().applyArrangedActivities(t.id, [
      [{ _draftId: 'd1', _source: 'auto', type: 'activity', name: 'Museum', time: '11:00', costPerPerson: 5 }],
      [],
    ]);

    const day0 = tripById(t.id).days[0].activities;
    const museum = day0.find(a => a.name === 'Museum');
    expect(museum).toBeTruthy();
    expect(museum.id).toBeTruthy();
    expect(museum._draftId).toBeUndefined();            // draft fields stripped
    expect(museum._source).toBeUndefined();
    expect(tripById(t.id).expenses.length).toBe(expensesBefore + 1); // costed stop funded
  });
});

describe('restoreTripState — undo a reset', () => {
  test('merges a saved snapshot back onto the trip', () => {
    const t = makeTrip();
    addDinner(t.id);
    const snapshot = { days: tripById(t.id).days, expenses: tripById(t.id).expenses, itineraryPushed: true };
    S().resetAllActivities(t.id);
    expect(tripById(t.id).days[0].activities.length).toBe(0);
    S().restoreTripState(t.id, snapshot);
    expect(tripById(t.id).days[0].activities.length).toBe(1);
    expect(tripById(t.id).expenses.length).toBe(1);
  });
});
