/**
 * peopleCascade.test.js — characterization net for peopleSlice's library/group
 * cascades + the family-head and empty-family-heir edges.
 *
 * The balance-critical delete paths (payer / non-payer / whole family) are gated by
 * splitDelete.regression. This file locks the OTHER people-surface data-integrity
 * cascades that were untested (peopleSlice was ~33% covered): the global traveler
 * library name-cascade + unlink, group link/unlink, setFamilyHead, and the
 * deleteTraveler heir FALLBACK when a family is emptied. Additive — locks current
 * behaviour so a future refactor can't silently corrupt the People tab / saved groups.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../index';

const S = () => useStore.getState();
const tripById = id => S().trips.find(t => t.id === id);

function makeTrip() {
  return S().createTrip({
    name: 'People', destination: 'X', startDate: '2026-06-12', endDate: '2026-06-14', mode: 'manual',
    familyForms: [
      { name: 'Aye', members: [{ name: 'A1', age: '30' }, { name: 'A2', age: '8' }] },
      { name: 'Bee', members: [{ name: 'B1', age: '40' }] },
    ],
  });
}
const fam = (id, i) => tripById(id).families[i];

describe('global traveler library cascades', () => {
  test('updateTraveler name cascades into linked, non-overridden trip members only', () => {
    S().createTraveler({ name: 'Dana', age: 30 });
    const tv = S().travelers[0];
    const t = makeTrip();
    // link member A1 to the traveler, leave A2 linked-but-overridden
    const f0 = fam(t.id, 0);
    S().updateTripMember(t.id, f0.id, f0.members[0].id, { travelerId: tv.id });
    S().updateTripMember(t.id, f0.id, f0.members[1].id, { travelerId: tv.id, _nameOverride: true });

    S().updateTraveler(tv.id, { name: 'Dana R.' });

    expect(S().travelers.find(x => x.id === tv.id).name).toBe('Dana R.');
    const m = fam(t.id, 0).members;
    expect(m[0].name).toBe('Dana R.');   // linked, not overridden → cascaded
    expect(m[1].name).toBe('A2');        // overridden → untouched
  });

  test('updateTraveler with no name change leaves trips untouched', () => {
    S().createTraveler({ name: 'Eli', age: 22 });
    const tv = S().travelers[0];
    const t = makeTrip();
    const before = tripById(t.id);
    S().updateTraveler(tv.id, { age: 23 });
    expect(tripById(t.id)).toBe(before); // same reference — no trip rewrite
    expect(S().travelers.find(x => x.id === tv.id).age).toBe(23);
  });

  test('deleteTravelerFromLibrary removes the traveler, nulls the member FK, scrubs groups', () => {
    S().createTraveler({ name: 'Fin', age: 50 });
    const tv = S().travelers[0];
    S().createGroup({ name: 'Crew', color: '#abc', travelerIds: [tv.id] });
    const g = S().groups[0];
    const t = makeTrip();
    const f0 = fam(t.id, 0);
    S().updateTripMember(t.id, f0.id, f0.members[0].id, { travelerId: tv.id });

    S().deleteTravelerFromLibrary(tv.id);

    expect(S().travelers.find(x => x.id === tv.id)).toBeUndefined();
    expect(fam(t.id, 0).members[0].travelerId).toBeNull();   // unlinked, member survives
    expect(fam(t.id, 0).members[0].name).toBe('A1');         // member itself stays
    expect(S().groups.find(x => x.id === g.id).travelerIds).not.toContain(tv.id);
  });
});

describe('groups: link / unlink integrity', () => {
  test('addTravelerToGroup is idempotent (no duplicate ids)', () => {
    S().createTraveler({ name: 'Gus', age: 12 });
    const tv = S().travelers[0];
    S().createGroup({ name: 'G', color: '#000', travelerIds: [] });
    const g = S().groups[0];
    S().addTravelerToGroup(g.id, tv.id);
    S().addTravelerToGroup(g.id, tv.id); // second add must be a no-op
    expect(S().groups.find(x => x.id === g.id).travelerIds).toEqual([tv.id]);
  });

  test('removeTravelerFromGroup drops the id, leaving others', () => {
    S().createGroup({ name: 'G2', color: '#111', travelerIds: ['x', 'y', 'z'] });
    const g = S().groups[0];
    S().removeTravelerFromGroup(g.id, 'y');
    expect(S().groups.find(x => x.id === g.id).travelerIds).toEqual(['x', 'z']);
  });

  test('deleteGroup removes it and unlinks groupId from any trip family', () => {
    S().createGroup({ name: 'G3', color: '#222', travelerIds: [] });
    const g = S().groups[0];
    const t = makeTrip();
    S().updateFamily(t.id, fam(t.id, 0).id, { groupId: g.id });

    S().deleteGroup(g.id);

    expect(S().groups.find(x => x.id === g.id)).toBeUndefined();
    expect(fam(t.id, 0).groupId).toBeNull();
  });
});

describe('setFamilyHead — the By-Group share carrier', () => {
  test('moves the chosen member to index 0, preserving the rest', () => {
    const t = makeTrip();
    const f0 = fam(t.id, 0);
    const secondId = f0.members[1].id;
    S().setFamilyHead(t.id, f0.id, secondId);
    const after = fam(t.id, 0).members;
    expect(after[0].id).toBe(secondId);
    expect(after).toHaveLength(2);
    expect(after.map(m => m.name).sort()).toEqual(['A1', 'A2']);
  });

  test('a non-existent member id is a no-op (order unchanged)', () => {
    const t = makeTrip();
    const f0 = fam(t.id, 0);
    const before = f0.members.map(m => m.id);
    S().setFamilyHead(t.id, f0.id, 'ghost');
    expect(fam(t.id, 0).members.map(m => m.id)).toEqual(before);
  });
});

describe('deleteTraveler — empty-family heir fallback', () => {
  test('removing a single-member family makes a trip-wide member the payment heir', () => {
    const t = makeTrip();
    const bee = fam(t.id, 1);              // Bee has the lone member B1
    const b1 = bee.members[0].id;
    const aye = fam(t.id, 0);
    const a1 = aye.members[0].id;
    // B1 fronts an expense, then B1 is deleted → Bee is now empty.
    S().addActivity(t.id, 0, { type: 'food', name: 'Tab', time: '19:00', costPerPerson: 12 });
    const exp = tripById(t.id).expenses[0];
    S().updateExpensePayer(t.id, exp.id, b1);

    S().deleteTraveler(t.id, bee.id, b1);

    const after = tripById(t.id).expenses.find(e => e.id === exp.id);
    // heir falls back to the first remaining member trip-wide (an Aye member),
    // so the credit never vanishes from the ledger.
    const surviving = tripById(t.id).families.flatMap(f => f.members).map(m => m.id);
    expect(surviving).toContain(after.paidBy);
    expect(after.paidBy).not.toBe(b1);
    expect([a1, aye.members[1].id]).toContain(after.paidBy);
  });
});
