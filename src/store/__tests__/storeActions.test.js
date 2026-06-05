/**
 * storeActions.test.js — characterization net for the store's MONEY-CASCADE actions.
 *
 * store.test.js pins createTrip + a few money assertions; this pins the per-action
 * side effects a future store-slice split must preserve byte-for-byte: the
 * activity↔expense cascade (create/update/delete/skip) and the expense-edit guards.
 * Additive — cannot break prod; locks CURRENT behaviour.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../index';

const S = () => useStore.getState();
const tripById = id => S().trips.find(t => t.id === id);

function makeTrip() {
  return S().createTrip({
    name: 'Acts', destination: 'X', startDate: '2026-06-12', endDate: '2026-06-14', mode: 'manual',
    familyForms: [
      { name: 'Aye', members: [{ name: 'A1', age: '30' }, { name: 'A2', age: '8' }] },
      { name: 'Bee', members: [{ name: 'B1', age: '40' }] },
    ],
  });
}
const addDinner = (id, cpp = 10) =>
  S().addActivity(id, 0, { type: 'food', name: 'Dinner', time: '19:00', costPerPerson: cpp });
const firstActId = id => tripById(id).days[0].activities[0].id;
const linkedExp = (id, actId) => tripById(id).expenses.find(e => e.activityId === actId);

describe('updateActivity — the 3-branch expense cascade', () => {
  test('cost changed → amount + estimatedAmount update, payer/participants PRESERVED', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                       // amount 30 = $10 × 3 members
    const actId = firstActId(t.id);
    const exp = tripById(t.id).expenses[0];
    const b1 = tripById(t.id).families[1].members[0].id;
    S().updateExpensePayer(t.id, exp.id, b1);  // user override
    S().updateActivity(t.id, actId, { costPerPerson: 20 });
    const e = linkedExp(t.id, actId);
    expect(e.amount).toBe(60);                  // 20 × 3
    expect(e.estimatedAmount).toBe(60);
    expect(e.paidBy).toBe(b1);                  // override survives the re-sync
    expect(e.participatingFamilies).toContain(tripById(t.id).families[1].id);
  });

  test('cost dropped to 0 → linked expense removed', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const actId = firstActId(t.id);
    expect(linkedExp(t.id, actId)).toBeTruthy();
    S().updateActivity(t.id, actId, { costPerPerson: 0 });
    expect(linkedExp(t.id, actId)).toBeUndefined();
  });

  test('cost added where there was none → expense created', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                        // makes the trip itineraryPushed
    S().addActivity(t.id, 0, { type: 'activity', name: 'Park', time: '10:00', costPerPerson: 0 });
    const parkId = tripById(t.id).days[0].activities.find(a => a.name === 'Park').id;
    expect(linkedExp(t.id, parkId)).toBeUndefined();
    S().updateActivity(t.id, parkId, { costPerPerson: 5 });
    const e = linkedExp(t.id, parkId);
    expect(e).toBeTruthy();
    expect(e.amount).toBe(15);                  // 5 × 3
  });
});

describe('deleteActivity', () => {
  test('removes the activity AND its linked expense (when pushed)', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const actId = firstActId(t.id);
    expect(tripById(t.id).expenses).toHaveLength(1);
    S().deleteActivity(t.id, actId);
    expect(tripById(t.id).days[0].activities).toHaveLength(0);
    expect(tripById(t.id).expenses).toHaveLength(0);
  });
});

describe('markActivityStatus — skip excludes the linked expense from settlement', () => {
  test('skipped → excluded:true; un-skip → excluded:false', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const actId = firstActId(t.id);
    S().markActivityStatus(t.id, actId, 'skipped');
    expect(linkedExp(t.id, actId).excluded).toBe(true);
    S().markActivityStatus(t.id, actId, null);
    expect(linkedExp(t.id, actId).excluded).toBe(false);
  });
});

describe('toggleExpenseMember — individual participant set + at-least-one guard', () => {
  test('removing a member narrows the set; re-adding restores; never empties', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp = tripById(t.id).expenses[0];
    const fams = tripById(t.id).families;
    const a1 = fams[0].members[0].id, a2 = fams[0].members[1].id, b1 = fams[1].members[0].id;

    S().toggleExpenseMember(t.id, exp.id, a2, false);  // null(=all 3) → [A1,B1]
    let e = tripById(t.id).expenses[0];
    expect(e.participatingMembers).toHaveLength(2);
    expect(e.participatingMembers).not.toContain(a2);

    S().toggleExpenseMember(t.id, exp.id, a2, true);    // back to 3
    expect(tripById(t.id).expenses[0].participatingMembers).toContain(a2);

    // remove down to the last one — the guard must keep ≥1
    S().toggleExpenseMember(t.id, exp.id, a1, false);
    S().toggleExpenseMember(t.id, exp.id, a2, false);
    S().toggleExpenseMember(t.id, exp.id, b1, false);   // would empty → kept
    expect(tripById(t.id).expenses[0].participatingMembers.length).toBeGreaterThanOrEqual(1);
  });
});

describe('updateExpenseCustomShares — partial updates do not clobber', () => {
  test('sets shares + flag; a later flag-only update preserves the shares', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp = tripById(t.id).expenses[0];
    S().updateExpenseCustomShares(t.id, exp.id, { x: 1, y: 2 }, true);
    let e = tripById(t.id).expenses[0];
    expect(e.unevenSplit).toBe(true);
    expect(e.customShares).toEqual({ x: 1, y: 2 });
    S().updateExpenseCustomShares(t.id, exp.id, undefined, false); // flip flag only
    e = tripById(t.id).expenses[0];
    expect(e.unevenSplit).toBe(false);
    expect(e.customShares).toEqual({ x: 1, y: 2 });               // shares untouched
  });
});
