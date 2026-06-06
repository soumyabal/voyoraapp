/**
 * exportPlan.test.js — the PDF HTML builders.
 *
 * Locks: the exciting cover/hero + motivating copy + promoted moat render, the day
 * PDF carries its route link + tappable addresses, AND — critically — the output
 * NEVER contains the Google API key or a Places photo URL (no key leak in a file
 * that gets shared). See the "make exciting / no photos" decision.
 */
import { buildHTML, buildDayHTML, buildSettlementHTML, tripPdfName } from '../exportPlan';

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
    expect(html).toContain('class="cover-tag"');       // a (varied) tagline renders
    expect(html).toContain('San Diego');               // place-aware tagline includes the city
    expect(html).toContain('background-image:linear-gradient'); // gradient hero (solid fallback too)
  });

  test('promotes THE MOAT with a headline + intro', () => {
    expect(html).toContain('What each family pays');
    expect(html).toMatch(/rooms . nights/);          // "rooms × nights"
  });

  test('per-day vibe line + closing note', () => {
    expect(html).toContain('class="day-vibe"');
    expect(html).toMatch(/class="closing">[^<]*✨/);   // a (varied) closing note
  });

  test('print-color-adjust set (so the hero/table colors survive PDF)', () => {
    expect(html).toContain('print-color-adjust: exact');
  });

  test('NO key leak in a shared file', () => noLeak(html));
});

describe('buildDayHTML (day PDF)', () => {
  const html = buildDayHTML(trip, trip.days[0], 0);

  test('day hero + vibe + plain addresses + VISIBLE day-route URL', () => {
    expect(html).toContain('class="cover"');
    expect(html).toContain('Day 1');
    expect(html).toContain('class="cover-tag"');     // the vibe one-liner
    expect(html).toContain('class="route-box"');     // route link box
    expect(html).toContain('class="route-url"');     // url shown as visible text
    expect(html).toMatch(/route-url[^>]*>https:\/\/www\.google\.com\/maps\/dir\//); // the URL is the link TEXT
    expect(html).toContain('1 Beach Rd');            // address as plain text
    expect(html).not.toContain('maps/search/?api=1&query='); // no per-address anchors
  });

  test('NO key leak in a shared file', () => noLeak(html));

  test('renders a day strictly in timestamp order, whatever the array order or type', () => {
    // Scrambled array order; a stop type/name carries NO ordering weight — only time does.
    // A stopover added with a LATER time than the drive must render AFTER it (not "drive = last").
    const acts = [
      { id: 'x1', type: 'transport', name: 'Drive back home', time: '18:00', costPerPerson: 0 },
      { id: 'x2', type: 'activity',  name: 'Morning Hike',    time: '09:00', costPerPerson: 0 },
      { id: 'x3', type: 'food',      name: 'Dinner Stopover', time: '20:00', costPerPerson: 30 },
      { id: 'x4', type: 'food',      name: 'Lunch Spot',      time: '13:00', costPerPerson: 12 },
    ];
    const out = buildHTML({ ...trip, days: [{ label: 'Day 1', date: '2099-06-12', activities: acts }] });

    const expected = acts.slice().map(a => a.name)
      .sort((p, q) => acts.find(a => a.name === p).time.localeCompare(acts.find(a => a.name === q).time));
    const rendered = acts.map(a => a.name).sort((p, q) => out.indexOf(p) - out.indexOf(q));
    expect(rendered).toEqual(expected);                 // exact ascending-time order
    expect(rendered[rendered.length - 1]).toBe('Dinner Stopover'); // later stopover, not the drive, is last
  });
});

// ─── PDF filename (compact underscores) ────────────────────────────────────────
describe('tripPdfName', () => {
  const t = {
    name: 'Bali Family Escape',
    startDate: '2026-07-12', endDate: '2026-07-19',
    focus: ['Family', 'Beaches'],
  };

  test('plan: name + dates (end as MM-DD same year) + purpose, .pdf', () => {
    expect(tripPdfName(t, 'plan'))
      .toBe('Bali-Family-Escape_2026-07-12_to_07-19_Family-Beaches.pdf');
  });

  test('settlement: name + Settlement + dates (no purpose)', () => {
    expect(tripPdfName(t, 'settlement'))
      .toBe('Bali-Family-Escape_Settlement_2026-07-12_to_07-19.pdf');
  });

  test('day: name + day label + that day’s date', () => {
    expect(tripPdfName(t, 'day', { label: 'Day 2', date: '2026-07-13' }))
      .toBe('Bali-Family-Escape_Day-2_2026-07-13.pdf');
  });

  test('cross-year keeps the full end date', () => {
    expect(tripPdfName({ ...t, startDate: '2026-12-30', endDate: '2027-01-02', focus: [] }, 'plan'))
      .toBe('Bali-Family-Escape_2026-12-30_to_2027-01-02.pdf');
  });

  test('no purpose set → drops the trailing segment cleanly', () => {
    expect(tripPdfName({ ...t, focus: [] }, 'plan'))
      .toBe('Bali-Family-Escape_2026-07-12_to_07-19.pdf');
  });

  test('over-long / messy names are slugged and capped at 50 chars', () => {
    const long = tripPdfName({
      name: '  Café Crème: The Spätzle & Smörgåsbord Grand Tour 2026!!!  ',
      startDate: '2026-05-01', endDate: '2026-05-03', focus: [],
    }, 'plan');
    const namePart = long.split('_')[0];
    expect(namePart.length).toBeLessThanOrEqual(50);
    expect(namePart).not.toMatch(/^-|-$/);            // no leading/trailing hyphen
    expect(namePart).toMatch(/^[A-Za-z0-9-]+$/);      // filesystem-safe
    expect(namePart).toContain('Cafe-Creme');         // accents folded
  });

  test('single-day trip (start === end) shows one date', () => {
    expect(tripPdfName({ name: 'Day Trip', startDate: '2026-08-01', endDate: '2026-08-01', focus: [] }, 'plan'))
      .toBe('Day-Trip_2026-08-01.pdf');
  });

  test('empty trip never yields a nameless file', () => {
    expect(tripPdfName({}, 'plan')).toBe('Trip.pdf');
  });
});

// ─── Settlement doc (the money artifact) ───────────────────────────────────────
const settleTrip = {
  name: 'Cabin Trip', emoji: '🏔️', destination: 'Tahoe, CA',
  startDate: '2099-07-01', endDate: '2099-07-03',
  bgColors: ['#10b981', '#34d399'],
  splitMode: 'individual',
  families: [
    { id: 'f1', name: 'Aye', color: '#6366f1', members: [{ id: 'm1', name: 'Avery' }] },
    { id: 'f2', name: 'Bee', color: '#ec4899', members: [{ id: 'm2', name: 'Bo' }] },
  ],
  days: [],
  // Avery paid $100 split across both → Bo owes Avery $50.
  expenses: [
    { id: 'e1', name: 'Cabin', category: '🏨', amount: 100, paidBy: 'm1', participatingFamilies: ['f1', 'f2'], participatingMembers: null, excluded: false },
  ],
};

describe('buildSettlementHTML (settlement PDF)', () => {
  const html = buildSettlementHTML(settleTrip);

  test('renders the who-owes-whom transfer (Bo → Avery $50)', () => {
    expect(html).toContain('Who pays whom');
    expect(html).toContain('class="settle-row"');
    expect(html).toContain('Bo');
    expect(html).toContain('Avery');
    expect(html).toContain('$50');
  });

  test('renders each family’s net (Aye +$50, Bee −$50)', () => {
    expect(html).toContain('Each family');
    expect(html).toContain('Aye');
    expect(html).toContain('Bee');
    expect(html).toMatch(/\+\$50/);   // Aye is up $50
  });

  test('lists the expense with its payer', () => {
    expect(html).toContain('Cabin');
    expect(html).toContain('Paid by Avery');
    expect(html).toMatch(/Total:\s*\$100/);
  });

  test('all-settled + no-expenses copy when there is nothing to settle', () => {
    const empty = buildSettlementHTML({ ...settleTrip, expenses: [] });
    expect(empty).toContain('All settled');
    expect(empty).toContain('No expenses recorded');
  });

  test('NO key leak in a shared file', () => noLeak(html));
});
