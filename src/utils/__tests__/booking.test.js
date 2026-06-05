/**
 * booking.test.js — the Booking.com deep-link builder. Pure URL math: only for stays,
 * name+city query, affiliate id appended only when set, graceful degradation.
 */
import { bookingUrl } from '../booking';

test('builds a booking.com search for a hotel by name + city', () => {
  const u = bookingUrl({ activityType: 'stay', name: 'Hotel Iroquois', city: 'Mackinac Island' });
  expect(u).toContain('https://www.booking.com/searchresults.html?ss=');
  expect(decodeURIComponent(u)).toContain('Hotel Iroquois, Mackinac Island');
});

test('omits aid when none configured, appends it when set', () => {
  const place = { activityType: 'stay', name: 'X', city: 'Y' };
  expect(bookingUrl(place, { aid: null })).not.toContain('aid=');
  expect(bookingUrl(place, { aid: '123456' })).toContain('aid=123456');
});

test('returns null for non-stay places (so non-hotels never get a Book link)', () => {
  expect(bookingUrl({ activityType: 'activity', name: 'Museum', city: 'Paris' })).toBeNull();
  expect(bookingUrl({ activityType: 'food', name: 'Cafe' })).toBeNull();
});

test('works on a stored activity (type:stay) too, and degrades without a city', () => {
  expect(bookingUrl({ type: 'stay', name: 'Inn', address: '1 Main St' })).toContain('ss=');
  expect(bookingUrl({ type: 'stay' })).toBeNull(); // nothing searchable
});

test('encodes special characters', () => {
  const u = bookingUrl({ activityType: 'stay', name: 'B&B Café', city: 'São Paulo' }, { aid: null });
  expect(u).toContain(encodeURIComponent('B&B Café, São Paulo'));
});
