/**
 * dayShare.test.js — generateDayShareText: a day → the shareable plain-text summary.
 */
import { generateDayShareText } from '../dayShare';

const day = (activities) => ({ label: 'Day 1', date: '2026-07-10', activities });
const trip = (activities) => ({ name: 'Bali Trip', destination: 'Bali, Indonesia', days: [day(activities)] });

describe('generateDayShareText', () => {
  test('missing day → empty string', () => {
    expect(generateDayShareText(trip([]), null, 0)).toBe('');
  });

  test('header carries trip name, day label, destination', () => {
    const t = trip([{ type: 'activity', name: 'Beach', time: '10:00' }]);
    const out = generateDayShareText(t, t.days[0], null);
    expect(out).toContain('*Bali Trip*');
    expect(out).toContain('Day 1');
    expect(out).toContain('📍 Bali, Indonesia');
  });

  test('groups stops into time slots', () => {
    const t = trip([
      { type: 'activity', name: 'Sunrise Hike', time: '07:00' },
      { type: 'food', name: 'Dinner Spot', time: '19:30' },
    ]);
    const out = generateDayShareText(t, t.days[0], null);
    expect(out).toContain('🌅 Morning');
    expect(out).toContain('Sunrise Hike');
    expect(out).toContain('Dinner Spot');
  });

  test('excludes skipped activities', () => {
    const t = trip([
      { type: 'activity', name: 'Kept', time: '10:00' },
      { type: 'activity', name: 'Dropped', time: '11:00', status: 'skipped' },
    ]);
    const out = generateDayShareText(t, t.days[0], null);
    expect(out).toContain('Kept');
    expect(out).not.toContain('Dropped');
  });

  test('per-person day cost line appears only when there is cost', () => {
    const paid = trip([{ type: 'activity', name: 'Tour', time: '10:00', costPerPerson: 40 }]);
    const free = trip([{ type: 'activity', name: 'Park', time: '10:00', costPerPerson: 0 }]);
    expect(generateDayShareText(paid, paid.days[0], null)).toMatch(/Day estimate:/);
    expect(generateDayShareText(free, free.days[0], null)).not.toMatch(/Day estimate:/);
  });

  test('no Maps route link when dayIndex is null', () => {
    const t = trip([{ type: 'activity', name: 'A', time: '10:00' }]);
    expect(generateDayShareText(t, t.days[0], null)).not.toMatch(/route in Maps/);
  });

  test('footer credits the app', () => {
    const t = trip([{ type: 'activity', name: 'A', time: '10:00' }]);
    expect(generateDayShareText(t, t.days[0], null)).toMatch(/Shared via/);
  });

  test('stops render in time order', () => {
    const t = trip([
      { type: 'activity', name: 'Later', time: '16:00' },
      { type: 'activity', name: 'Earlier', time: '09:00' },
    ]);
    const out = generateDayShareText(t, t.days[0], null);
    expect(out.indexOf('Earlier')).toBeLessThan(out.indexOf('Later'));
  });
});
