/**
 * shellUpdates.test.js — lifecycle reminder cards (settle-up + starting-soon).
 */
import { buildUpdates } from '../shellUpdates';

const NOW = new Date('2026-06-09T12:00:00').getTime(); // "today" = 2026-06-09

const trip = (over) => ({ id: 't', name: 'Trip', startDate: '2026-06-20', endDate: '2026-06-25', expenses: [], ...over });

describe('settle-up card', () => {
  const ended = { startDate: '2026-05-01', endDate: '2026-05-05' };

  test('an ended, non-archived trip with real spend gets a settle card', () => {
    const r = buildUpdates([trip({ ...ended, expenses: [{ amount: 100 }] })], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe('settle-t');
    expect(r[0].title).toBe('Settle up');
  });

  test('archived trips are not nudged', () => {
    expect(buildUpdates([trip({ ...ended, archived: true, expenses: [{ amount: 100 }] })], NOW)).toEqual([]);
  });

  test('excluded or zero-amount expenses do not count as spend', () => {
    expect(buildUpdates([trip({ ...ended, expenses: [{ amount: 100, excluded: true }, { amount: 0 }] })], NOW)).toEqual([]);
  });
});

describe('starting-soon card', () => {
  test('an upcoming trip within 3 days gets a starting card with its countdown label', () => {
    const r = buildUpdates([trip({ id: 'soon', name: 'Beach', startDate: '2026-06-11', endDate: '2026-06-14' })], NOW);
    expect(r).toHaveLength(1);
    expect(r[0].key).toBe('start-soon');
    expect(r[0].title).toBe('Beach · in 2 days');
  });

  test('a trip more than 3 days out is not nudged yet', () => {
    expect(buildUpdates([trip({ startDate: '2026-06-20', endDate: '2026-06-25' })], NOW)).toEqual([]);
  });
});

test('an ongoing trip yields no lifecycle card (handled by the expense-log nudge elsewhere)', () => {
  expect(buildUpdates([trip({ startDate: '2026-06-08', endDate: '2026-06-12', expenses: [{ amount: 50 }] })], NOW)).toEqual([]);
});

test('empty / nullish input is safe', () => {
  expect(buildUpdates([], NOW)).toEqual([]);
  expect(buildUpdates(undefined, NOW)).toEqual([]);
});
