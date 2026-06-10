/**
 * groupStats.test.js — "trips together" derivation for a saved group.
 */
import { tripsForGroup, tripCountForGroup } from '../groupStats';

const mkTrip = (id, travelerIds) => ({
  id,
  families: [{ id: `${id}-f1`, members: travelerIds.map((tid, i) => ({ id: `${id}-m${i}`, travelerId: tid })) }],
});

const group = { id: 'g1', travelerIds: ['tv1', 'tv2'] };
const trips = [
  mkTrip('a', ['tv1', 'tv9']),   // tv1 in group → counts
  mkTrip('b', ['tv5', 'tv6']),   // none in group → no
  mkTrip('c', ['tv2']),          // tv2 in group → counts
  { id: 'd' },                   // no families key → safe, no
  mkTrip('e', [null, undefined]), // members with no travelerId → no
];

test('tripsForGroup returns only trips containing a group traveler', () => {
  expect(tripsForGroup(group, trips).map((t) => t.id)).toEqual(['a', 'c']);
});

test('tripCountForGroup counts them', () => {
  expect(tripCountForGroup(group, trips)).toBe(2);
});

test('an empty group or no trips is safe (0)', () => {
  expect(tripCountForGroup({ travelerIds: [] }, trips)).toBe(0);
  expect(tripCountForGroup(group, [])).toBe(0);
  expect(tripCountForGroup(undefined, undefined)).toBe(0);
});
