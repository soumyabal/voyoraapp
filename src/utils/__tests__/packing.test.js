/**
 * packing.test.js — the Smart Packing List engine. Pure + deterministic, so every contextual
 * rule is pinned: the list reasons from the itinerary, families, dates, and timezones.
 */
import { buildPackingList } from '../packing';

const day = (date, activities) => ({ label: date, date, activities });
const A = (name, type, extra = {}) => ({ id: name, name, type, status: null, ...extra });
const keys = (trip) => buildPackingList(trip).items.map(i => i.key);
const reasonFor = (trip, key) => buildPackingList(trip).items.find(i => i.key === key)?.reason;

describe('buildPackingList — always-on essentials', () => {
  const t = { startDate: '2026-07-10', endDate: '2026-07-13', days: [day('2026-07-10', [])],
    families: [{ id: 'f', members: [{ id: 'm', name: 'A', age: 30 }] }] };
  test('includes the universal basics', () => {
    expect(keys(t)).toEqual(expect.arrayContaining(['phone-charger', 'wallet', 'id', 'meds', 'toothbrush', 'tops']));
  });
  test('groups by category, only non-empty groups', () => {
    const { byCategory } = buildPackingList(t);
    expect(byCategory.every(g => g.items.length > 0)).toBe(true);
    expect(byCategory.map(g => g.category)).toEqual(expect.arrayContaining(['Essentials', 'Clothing', 'Documents']));
  });
});

describe('buildPackingList — contextual rules (the delight)', () => {
  const trip = (acts, extra = {}) => ({
    startDate: '2026-07-10', endDate: '2026-07-15',
    days: [day('2026-07-10', acts)],
    families: [{ id: 'f', members: [{ id: 'm', name: 'A', age: 30 }] }],
    ...extra,
  });

  test('a beach day adds swimsuit + reef-safe sunscreen, with a reason', () => {
    const t = trip([A('Santa Monica Pier & beach walk', 'activity')]);
    expect(keys(t)).toEqual(expect.arrayContaining(['swimsuit', 'beach-sunscreen', 'sandals']));
    expect(reasonFor(t, 'swimsuit')).toMatch(/beach/i);
  });

  test('a hike adds hiking shoes + daypack', () => {
    expect(keys(trip([A('Hike the Griffith Park trails', 'activity')]))).toEqual(expect.arrayContaining(['hiking-shoes', 'daypack']));
  });

  test('a theme-park / zoo day adds comfortable shoes + poncho', () => {
    expect(keys(trip([A('San Diego Zoo', 'activity')]))).toEqual(expect.arrayContaining(['comfy-shoes', 'poncho']));
  });

  test('a flight adds headphones + power bank; a red-eye adds an eye mask', () => {
    const dayFlight = trip([A('Flight to NYC', 'transport', { subtype: 'flight', time: '09:00', arriveTime: '17:00' })]);
    expect(keys(dayFlight)).toEqual(expect.arrayContaining(['headphones', 'powerbank']));
    expect(keys(dayFlight)).not.toContain('eye-mask');
    const redEye = trip([A('Red-eye to NYC', 'transport', { subtype: 'flight', time: '23:00', arriveTime: '07:00' })]);
    expect(keys(redEye)).toContain('eye-mask');
  });

  test('an international trip (different tz region) adds passport + adapter', () => {
    const intl = trip([A('Explore Tokyo', 'activity')], { homeTz: 'America/Chicago', defaultTz: 'Asia/Tokyo' });
    expect(keys(intl)).toEqual(expect.arrayContaining(['passport', 'adapter', 'currency']));
    const domestic = trip([A('Explore LA', 'activity')], { homeTz: 'America/Chicago', defaultTz: 'America/Los_Angeles' });
    expect(keys(domestic)).not.toContain('passport');
  });

  test('season: summer adds sunscreen, winter adds a warm jacket', () => {
    expect(keys(trip([A('City walk', 'activity')], { startDate: '2026-07-10' }))).toContain('sunscreen');
    expect(keys(trip([A('City walk', 'activity')], { startDate: '2026-01-10' }))).toContain('jacket');
  });

  test('travelers: a child adds snacks + entertainment; an infant adds diapers', () => {
    const withKid = trip([A('Park', 'activity')], { families: [{ id: 'f', members: [{ id: 'k', name: 'Kid', age: 7 }] }] });
    expect(keys(withKid)).toEqual(expect.arrayContaining(['kid-snacks', 'kid-entertain']));
    const withBaby = trip([A('Park', 'activity')], { families: [{ id: 'f', members: [{ id: 'b', name: 'Baby', age: 1 }] }] });
    expect(keys(withBaby)).toEqual(expect.arrayContaining(['diapers', 'stroller']));
  });

  test('a wheelchair need adds an accessibility kit', () => {
    const t = trip([A('Museum', 'activity')], { families: [{ id: 'f', members: [{ id: 'm', name: 'A', age: 60, needs: ['♿ Wheelchair'] }] }] });
    expect(keys(t)).toContain('access-kit');
  });

  test('every item carries a non-empty reason (never feels generic)', () => {
    const t = trip([A('Beach', 'activity'), A('Flight', 'transport', { subtype: 'flight' })]);
    for (const it of buildPackingList(t).items) expect(typeof it.reason === 'string' && it.reason.length).toBeTruthy();
  });
});
