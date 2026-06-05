/**
 * exportPlan.test.js — the PDF HTML builders.
 *
 * Locks: the exciting cover/hero + motivating copy + promoted moat render, the day
 * PDF carries its route link + tappable addresses, AND — critically — the output
 * NEVER contains the Google API key or a Places photo URL (no key leak in a file
 * that gets shared). See the "make exciting / no photos" decision.
 */
import { buildHTML, buildDayHTML } from '../exportPlan';

const trip = {
  name: 'Coast Trip', emoji: '🏖️', destination: 'San Diego, CA',
  startDate: '2099-06-12', endDate: '2099-06-14',          // future → positive countdown
  bgColors: ['#ff8a5b', '#ffd36e'],
  families: [
    { id: 'f1', name: 'Aye', color: '#6366f1', members: [{ id: 'm1', name: 'A', age: 30 }] },
    { id: 'f2', name: 'Bee', color: '#ec4899', members: [{ id: 'm2', name: 'B', age: 28 }] },
  ],
  days: [
    { label: 'Day 1', date: '2099-06-12', activities: [
      { id: 'a1', type: 'activity', name: 'Sunny Cove', time: '10:00', address: '1 Beach Rd, San Diego', lat: 32.70, lng: -117.20, costPerPerson: 0 },
      { id: 'a2', type: 'food', name: 'Taco Stand', time: '13:00', address: '2 Main St', lat: 32.71, lng: -117.21, costPerPerson: 15 },
    ] },
  ],
  budgetByFamily: [{ familyId: 'f1', familyName: 'Aye', accommodation: 100, transit: 20, meals: 30, activities: 10, total: 160, memberCount: 1 }],
  expenses: [],
};

const noLeak = (html) => {
  expect(html).not.toMatch(/key=/);                 // no API key query param
  expect(html).not.toContain('places.googleapis.com'); // no Places photo/media URL
  expect(html).not.toContain('AIza');               // Google API keys start with AIza
};

describe('buildHTML (full-trip PDF)', () => {
  const html = buildHTML(trip);

  test('has an exciting cover: hero, emoji, title, countdown, tagline', () => {
    expect(html).toContain('class="cover"');
    expect(html).toContain('🏖️');
    expect(html).toContain('Coast Trip');
    expect(html).toContain('✦');                      // countdown pill marker
    expect(html).toContain('one San Diego adventure'); // tagline from coverTagline
    expect(html).toContain('background-image:linear-gradient'); // gradient hero (solid fallback too)
  });

  test('promotes THE MOAT with a headline + intro', () => {
    expect(html).toContain('What each family pays');
    expect(html).toMatch(/rooms . nights/);          // "rooms × nights"
  });

  test('per-day vibe line + closing note', () => {
    expect(html).toContain('class="day-vibe"');
    expect(html).toContain('go make the stories');
  });

  test('print-color-adjust set (so the hero/table colors survive PDF)', () => {
    expect(html).toContain('print-color-adjust: exact');
  });

  test('NO key leak in a shared file', () => noLeak(html));
});

describe('buildDayHTML (day PDF)', () => {
  const html = buildDayHTML(trip, trip.days[0], 0);

  test('day hero + vibe + tappable addresses + day-route link', () => {
    expect(html).toContain('class="cover"');
    expect(html).toContain('Day 1');
    expect(html).toContain('class="cover-tag"');           // the vibe one-liner
    expect(html).toContain('maps/dir/');                   // path-style day-route link
    expect(html).toContain('maps/search/?api=1&query=');   // per-address place link
    expect(html).toContain('1 Beach Rd');
  });

  test('NO key leak in a shared file', () => noLeak(html));
});
