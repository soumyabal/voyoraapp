/**
 * tripStatus.test.js — buildStatusPill: trip phase + today → the status-pill copy.
 */
import { buildStatusPill } from '../tripStatus';

const trip = (over = {}) => ({ startDate: '2026-07-10', days: [{}, {}, {}], ...over });

describe('buildStatusPill', () => {
  test('upcoming, several days out → "In N days"', () => {
    expect(buildStatusPill(trip(), 'upcoming', -1, '2026-07-01')).toEqual({ tone: 'upcoming', text: '📅 In 9 days' });
  });

  test('upcoming, one day out → "Tomorrow"', () => {
    expect(buildStatusPill(trip(), 'upcoming', -1, '2026-07-09').text).toBe('📅 Tomorrow');
  });

  test('upcoming, starts today or already past start → "Starts today"', () => {
    expect(buildStatusPill(trip(), 'upcoming', -1, '2026-07-10').text).toBe('📅 Starts today'); // n === 0
    expect(buildStatusPill(trip(), 'upcoming', -1, '2026-07-15').text).toBe('📅 Starts today'); // n < 0
  });

  test('active → "Day X of N · today" (1-based)', () => {
    expect(buildStatusPill(trip(), 'active', 1, '2026-07-11')).toEqual({ tone: 'active', text: '🟢 Day 2 of 3 · today' });
  });

  test('past → "Trip complete"', () => {
    expect(buildStatusPill(trip(), 'past', -1, '2026-07-20')).toEqual({ tone: 'past', text: '✓ Trip complete' });
  });

  test('undated / unknown phase → null (no pill)', () => {
    expect(buildStatusPill(trip(), 'undated', -1, '2026-07-01')).toBeNull();
  });
});
