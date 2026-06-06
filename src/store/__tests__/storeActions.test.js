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
import { calcBalances } from '../../utils/costs';

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

describe('updateActivity — trimming a stay’s nights never moves money (hotel-overlap fix safety)', () => {
  test('changing only nights leaves the linked expense amount unchanged', () => {
    const t = makeTrip();                        // 3 members
    addDinner(t.id, 10);                          // pushes the itinerary
    S().addActivity(t.id, 0, { type: 'stay', name: 'Hotel A', time: '15:00', nights: 2, costPerPerson: 100 });
    const stayId = tripById(t.id).days[0].activities.find(a => a.type === 'stay').id;
    expect(linkedExp(t.id, stayId).amount).toBe(300);   // 100 × 3 members — nights does NOT multiply

    // Exactly what the "Trim to N nights" Trip Check fix calls:
    S().updateActivity(t.id, stayId, { nights: 1 });

    const after = linkedExp(t.id, stayId);
    expect(after.amount).toBe(300);                       // unchanged — money path untouched
    expect(after.estimatedAmount).toBe(300);
    expect(tripById(t.id).days[0].activities.find(a => a.type === 'stay').nights).toBe(1);  // nights DID change
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

describe('moveActivity — keeps the expense link across days', () => {
  test('moves the activity, preserves activityId; no-op when from === to', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const actId = firstActId(t.id);
    const expId = tripById(t.id).expenses[0].id;
    S().moveActivity(t.id, 0, 1, actId);
    let t2 = tripById(t.id);
    expect(t2.days[0].activities).toHaveLength(0);
    expect(t2.days[1].activities.find(a => a.id === actId)).toBeTruthy();
    expect(t2.expenses.find(e => e.id === expId).activityId).toBe(actId); // link intact
    S().moveActivity(t.id, 1, 1, actId);                                  // no-op
    expect(tripById(t.id).days[1].activities.find(a => a.id === actId)).toBeTruthy();
  });
});

describe('applyArrangedActivities — append-only merge, strips draft fields', () => {
  test('appends to days without overwriting, strips _draftId/_source, funds costed', () => {
    const t = makeTrip();
    addDinner(t.id, 10); // itineraryPushed = true; day 0 has Dinner
    S().applyArrangedActivities(t.id, [
      [],
      [{ name: 'Museum', type: 'activity', time: '10:00', costPerPerson: 5, _draftId: 'd1', _source: 'discover' }],
      [],
    ]);
    const t2 = tripById(t.id);
    expect(t2.days[0].activities.find(a => a.name === 'Dinner')).toBeTruthy(); // untouched
    const museum = t2.days[1].activities.find(a => a.name === 'Museum');
    expect(museum).toBeTruthy();
    expect(museum.id).toBeTruthy();
    expect(museum._draftId).toBeUndefined();
    expect(museum._source).toBeUndefined();
    expect(t2.expenses.find(e => e.activityId === museum.id)).toBeTruthy(); // costed → funded
  });
});

describe('applyPlannedActivities — budget attachment', () => {
  test('with ._budget → populates expenses/budgetByFamily/agentMeta + marks pushed', () => {
    const t = makeTrip();
    const dayActivities = [[{ name: 'Check-in', type: 'stay', time: '15:00' }], [], []];
    dayActivities._budget = {
      expenses: [{ id: 'be1', name: 'Hotel', amount: 200, estimatedAmount: 200, source: 'itinerary', participatingFamilies: [], participatingMembers: null, excluded: false }],
      budgetByFamily: [{ famId: 'x', total: 200 }],
      meta: { ran: true },
    };
    S().applyPlannedActivities(t.id, dayActivities);
    const t2 = tripById(t.id);
    expect(t2.itineraryPushed).toBe(true);
    expect(t2.expenses.find(e => e.name === 'Hotel')).toBeTruthy();
    expect(t2.budgetByFamily).toEqual([{ famId: 'x', total: 200 }]);
    expect(t2.agentMeta).toEqual({ ran: true });
    expect(t2.days[0].activities[0].id).toBeTruthy(); // id assigned
  });

  test('without ._budget → writes days only, does not mark pushed', () => {
    const t = makeTrip();
    S().applyPlannedActivities(t.id, [[{ name: 'Walk', type: 'activity' }], [], []]);
    const t2 = tripById(t.id);
    expect(t2.days[0].activities[0].name).toBe('Walk');
    expect(t2.itineraryPushed).toBe(false);
  });
});

describe('updateExpensePayments — multiple payers (data model + no-leak on delete)', () => {
  test('sets payments + paidBy = largest payer; books still balance', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                         // $30 expense, 3 members
    const exp  = tripById(t.id).expenses[0];
    const fams = tripById(t.id).families;
    const a1 = fams[0].members[0].id, a2 = fams[0].members[1].id, b1 = fams[1].members[0].id;
    S().updateExpensePayments(t.id, exp.id, [{ memberId: a1, amount: 20 }, { memberId: b1, amount: 10 }]);
    const e = tripById(t.id).expenses[0];
    expect(e.payments).toEqual([{ memberId: a1, amount: 20 }, { memberId: b1, amount: 10 }]);
    expect(e.paidBy).toBe(a1);                   // largest payer
    const net = Object.fromEntries(calcBalances(tripById(t.id)).map(b => [b.member.id, b.net]));
    expect(net[a1] + net[a2] + net[b1]).toBeCloseTo(0);   // Σ net = 0 (no leak)
  });

  test('deleting a payer re-homes their payment to the heir — never leaks', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp  = tripById(t.id).expenses[0];
    const fams = tripById(t.id).families;
    const a1 = fams[0].members[0].id, b1 = fams[1].members[0].id;
    S().updateExpensePayments(t.id, exp.id, [{ memberId: a1, amount: 15 }, { memberId: b1, amount: 15 }]);
    S().deleteTraveler(t.id, fams[0].id, a1);    // remove A1 — a payer
    const e = tripById(t.id).expenses[0];
    expect((e.payments || []).some(p => p.memberId === a1)).toBe(false);          // A1's payment re-homed
    expect((e.payments || []).reduce((s, p) => s + p.amount, 0)).toBe(30);        // still sums to the bill
    expect(calcBalances(tripById(t.id)).reduce((s, b) => s + b.net, 0)).toBeCloseTo(0); // no leak
  });

  test('invalid/empty payment lists are a no-op (never clobbers the single payer)', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp = tripById(t.id).expenses[0];
    const origPayer = exp.paidBy;
    S().updateExpensePayments(t.id, exp.id, []);                          // empty
    S().updateExpensePayments(t.id, exp.id, [{ memberId: 'x', amount: 0 }, { amount: 5 }]); // all junk
    S().updateExpensePayments(t.id, exp.id, null);                        // not an array
    const e = tripById(t.id).expenses[0];
    expect(e.payments).toBeUndefined();   // never written
    expect(e.paidBy).toBe(origPayer);     // single payer preserved
  });

  test('zero/negative payment entries are filtered; paidBy = the surviving largest', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp  = tripById(t.id).expenses[0];
    const fams = tripById(t.id).families;
    const a1 = fams[0].members[0].id, b1 = fams[1].members[0].id;
    S().updateExpensePayments(t.id, exp.id, [
      { memberId: a1, amount: 20 }, { memberId: b1, amount: -5 }, { memberId: a1, amount: 0 },
    ]);
    const e = tripById(t.id).expenses[0];
    expect(e.payments).toEqual([{ memberId: a1, amount: 20 }]);  // only the positive entry
    expect(e.paidBy).toBe(a1);
  });
});

describe('expense-edit guards (tests-only — locks current behaviour)', () => {
  test('updateExpenseAmount changes amount but never the FROZEN estimatedAmount', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                          // estimatedAmount frozen at 30
    const exp = tripById(t.id).expenses[0];
    expect(exp.estimatedAmount).toBe(30);
    S().updateExpenseAmount(t.id, exp.id, 99);
    const e = tripById(t.id).expenses[0];
    expect(e.amount).toBe(99);
    expect(e.estimatedAmount).toBe(30);           // invariant: estimate is frozen
  });

  test('toggleExpenseExcluded pulls the expense out of settlement, then restores it', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                          // the only expense → drives the ledger
    const exp = tripById(t.id).expenses[0];
    const owedNow = () => calcBalances(tripById(t.id)).reduce((s, b) => s + Math.abs(b.net), 0);
    expect(owedNow()).toBeGreaterThan(0);         // someone owes
    S().toggleExpenseExcluded(t.id, exp.id);
    expect(tripById(t.id).expenses[0].excluded).toBe(true);
    expect(owedNow()).toBeCloseTo(0);             // excluded → out of the ledger
    S().toggleExpenseExcluded(t.id, exp.id);
    expect(tripById(t.id).expenses[0].excluded).toBe(false);
    expect(owedNow()).toBeGreaterThan(0);         // back in
  });

  test('updateExpenseSplitMode sets the per-expense override', () => {
    const t = makeTrip();
    addDinner(t.id, 10);
    const exp = tripById(t.id).expenses[0];
    S().updateExpenseSplitMode(t.id, exp.id, 'individual');
    expect(tripById(t.id).expenses[0].splitMode).toBe('individual');
    S().updateExpenseSplitMode(t.id, exp.id, 'family');
    expect(tripById(t.id).expenses[0].splitMode).toBe('family');
  });

  test('toggleSettlementPaid adds then removes the transfer key', () => {
    const t = makeTrip();
    const key = 'm1→m2';
    expect(tripById(t.id).settledTransfers || []).not.toContain(key);
    S().toggleSettlementPaid(t.id, key);
    expect(tripById(t.id).settledTransfers).toContain(key);
    S().toggleSettlementPaid(t.id, key);
    expect(tripById(t.id).settledTransfers).not.toContain(key);
  });

  test('clearPushedItinerary drops itinerary expenses, keeps manual, unflags pushed', () => {
    const t = makeTrip();
    addDinner(t.id, 10);                          // itinerary expense + itineraryPushed
    S().addExpense(t.id, {
      name: 'Cash tip', amount: 40, category: '💰', paidBy: tripById(t.id).families[0].members[0].id,
      participatingFamilies: tripById(t.id).families.map(f => f.id), source: 'manual', excluded: false,
    });
    expect(tripById(t.id).itineraryPushed).toBe(true);
    expect(tripById(t.id).expenses.length).toBe(2);
    S().clearPushedItinerary(t.id);
    const e = tripById(t.id).expenses;
    expect(e.length).toBe(1);
    expect(e[0].name).toBe('Cash tip');           // manual survives
    expect(e.some(x => x.source === 'itinerary')).toBe(false);
    expect(tripById(t.id).itineraryPushed).toBe(false);
  });
});
