/**
 * itineraryExtract.test.js — the deterministic front-half of Smart Paste: normalize loose LLM
 * extraction JSON into the assembler shape, and the extract seam (injected LLM vs rules fallback).
 * No keys / no network — the "LLM" is a fake injected function.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import useStore from '../../store';
import { normalizeExtraction, extractItinerary } from '../itineraryExtract';
import { buildTripFromParsed } from '../itineraryImport';

describe('normalizeExtraction — repair/validate LLM JSON → assembler shape', () => {
  test('synthesises consecutive dates from dayNumber when no calendar date', () => {
    const raw = { days: [
      { dayNumber: 1, title: 'Arrive', city: 'Tokyo', items: [{ name: 'Land at NRT', type: 'transport', sub: 'flight', time: '15:00' }] },
      { dayNumber: 2, items: [{ name: 'Sensoji', type: 'activity', time: '9:30' }] },
    ] };
    const n = normalizeExtraction(raw, { startDate: '2026-09-10' });
    expect(n.days.map(d => d.date)).toEqual(['2026-09-10', '2026-09-11']);
    expect(n.days[0].segment).toBe('Tokyo');
    expect(n.days[0].items[0].type).toBe('transport');
    expect(n.days[1].items[0].time).toBe('09:30');   // padded
  });

  test('a no-date paste defaults to a FUTURE start (not "Happening now" today)', () => {
    const n = normalizeExtraction({ days: [
      { dayNumber: 1, items: [{ name: 'Fly out' }] },
      { dayNumber: 2, items: [{ name: 'Explore' }] },
    ] });
    const today = new Date().toISOString().slice(0, 10);
    expect(n.days[0].date > today).toBe(true);          // upcoming, not today (was "happening now")
    expect(n.days[1].date > n.days[0].date).toBe(true); // still consecutive
  });

  test('preserves stated 12-hour times (9 AM / 9:30 PM) and 24h, drops non-times', () => {
    const n = normalizeExtraction({ days: [{ dayNumber: 1, items: [
      { name: 'Breakfast', type: 'food', time: '9 AM' },
      { name: 'Sunset cruise', type: 'activity', time: '6:45 pm' },
      { name: 'Late show', type: 'activity', time: '21:00' },
      { name: 'Midnight snack', type: 'food', time: '12 AM' },
      { name: 'Vague stop', type: 'activity', time: 'sometime' },
    ] }] });
    const times = n.days[0].items.map(i => i.time);
    expect(times).toEqual(['09:00', '18:45', '21:00', '00:00', null]);
  });

  test('keeps a real calendar date when present', () => {
    const n = normalizeExtraction({ days: [{ date: '2026-07-04', items: [{ name: 'Fireworks', type: 'activity' }] }] });
    expect(n.days[0].date).toBe('2026-07-04');
  });

  test('coerces unknown types to activity, drops unnamed items, marks options', () => {
    const n = normalizeExtraction({ days: [{ dayNumber: 1, items: [
      { name: 'Mystery', type: 'banana' },         // bad type → activity
      { type: 'food' },                            // no name → dropped
      { name: 'Universal', type: 'activity', option: 'a' },  // option → kind option, upper A
    ] }] }, { startDate: '2026-07-01' });
    const items = n.days[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('activity');
    expect(items.find(i => i.place === 'Universal').kind).toBe('option');
    expect(items.find(i => i.place === 'Universal').optionKey).toBe('A');
  });

  test('garbage / empty input → no days + a warning, never throws', () => {
    expect(normalizeExtraction(null).days).toEqual([]);
    expect(normalizeExtraction({ days: 'nope' }).warnings.length).toBeGreaterThan(0);
  });
});

describe('extractItinerary — seam (injected LLM vs deterministic fallback)', () => {
  const fakeLLM = async () => ({ days: [
    { dayNumber: 1, city: 'Paris', items: [{ name: 'Louvre', type: 'activity', time: '10:00' }] },
  ] });

  test('uses the injected extractor when it yields days (source: ai)', async () => {
    const r = await extractItinerary('whatever', { extract: fakeLLM, startDate: '2026-05-01' });
    expect(r.source).toBe('ai');
    expect(r.days[0].items[0].place).toBe('Louvre');
  });

  test('falls back to the rules parser when no extractor is given (source: rules)', async () => {
    const r = await extractItinerary('Day 1: Arrival\nMorning: Walk around', { startDate: '2026-05-01' });
    expect(r.source).toBe('rules');
    expect(r.days.length).toBeGreaterThan(0);
  });

  test('falls back when the extractor throws (resilient, never throws)', async () => {
    const r = await extractItinerary('Day 1: Arrival\nMorning: Walk', { extract: async () => { throw new Error('no key'); }, startDate: '2026-05-01' });
    expect(r.source).toBe('rules');
  });

  test('end-to-end: AI extraction → existing assembler builds a real trip (no rules parser)', async () => {
    const r = await extractItinerary('ignored', { extract: fakeLLM, startDate: '2026-05-01' });
    const created = buildTripFromParsed(useStore.getState(), r);
    const trip = useStore.getState().trips.find(t => t.id === created.trip.id);
    expect(trip.days[0].activities.some(a => a.name === 'Louvre')).toBe(true);
  });
});
