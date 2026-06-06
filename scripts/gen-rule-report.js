/**
 * gen-rule-report.js — a LIVING visualization of the Trip Check rule engine.
 *
 * Runs the REAL validateTrip() over a set of illustrative sample trips and renders a
 * self-contained, local HTML report (no network, no external assets):
 *   1. Rule catalog — every warning `type` the engine emitted, its severity tier, and a
 *      real example (title · message · hint), derived straight from engine output (can't drift).
 *   2. Per-sample results — each sample trip → the warnings it produces, color-coded by tier.
 *
 * Run:  node scripts/gen-rule-report.js   (or: npm run rule-report)
 * Out:  docs/rule-report.html
 *
 * How it loads the engine: tripValidator + its closure (geo/hours/helpers) are pure ESM with no
 * React-Native imports, so we transpile project .js on require (@babel modules→cjs) and run them
 * straight in Node. Same spirit as gen-icon.js / gen-music.js — local, deterministic, no deps added.
 */
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const cjsPlugin = require('@babel/plugin-transform-modules-commonjs');
const Module = require('module');

// ── Transpile-on-require for project sources (ESM → CJS), leave node_modules alone ──
const realJs = Module._extensions['.js'];
Module._extensions['.js'] = function (module, filename) {
  if (filename.includes('node_modules')) return realJs(module, filename);
  const src = fs.readFileSync(filename, 'utf8');
  const { code } = babel.transformSync(src, { filename, babelrc: false, configFile: false, plugins: [cjsPlugin] });
  module._compile(code, filename);
};

const { validateTrip } = require('../src/utils/tripValidator');
const { resolveMode, famExpenseShare, memberExpenseShare, calcBalances, calcSettlements } = require('../src/utils/costs');

// ── Illustrative sample trips (fixed dates → deterministic) ─────────────────────────
// Chosen to exercise a broad spread of rules. NOT the test fixtures (those aren't exported);
// this set is for human reading. FRI = 2026-06-12.
const FRI = '2026-06-12';
const day = (label, date, activities) => ({ label, date, activities });
const A = (id, type, time, extra = {}) => ({ id, type, name: id, time, ...extra });
const T = (name, days, extra = {}) => ({ name, families: [], days, ...extra });

const SAMPLES = [
  T('A calm, well-paced day', [
    day('Day 1', FRI, [
      A('Harbor Museum', 'activity', '10:00', { durationMins: 120, lat: 0, lng: 0 }),
      A('Lunch', 'food', '13:00', { durationMins: 60, lat: 0, lng: 0.001 }),
    ]),
  ]),
  T('Two stops that overlap', [
    day('Day 1', FRI, [
      A('City Tour', 'activity', '09:00', { durationMins: 180, lat: 0, lng: 0 }),
      A('Rooftop Show', 'activity', '10:00', { durationMins: 60, lat: 0, lng: 0 }),
    ]),
  ]),
  T('Far apart, too little time between', [
    day('Day 1', FRI, [
      A('North Beach', 'activity', '09:00', { durationMins: 120, lat: 0, lng: 0 }),
      A('South Pier', 'activity', '11:10', { durationMins: 60, lat: 0, lng: 0.09 }),
    ]),
  ]),
  T('Venue closed that day', [
    day('Day 1', FRI, [
      A('Mondays-only Gallery', 'activity', '11:00', { durationMins: 60, openHours: [{ d: 1, o: 540, c: 1020 }] }),
    ]),
  ]),
  T('Empty middle day + unbooked nights', [
    day('Day 1', FRI, [A('Arrive & explore', 'activity', '14:00', { durationMins: 120 })]),
    day('Day 2', '2026-06-13', []),
    day('Day 3', '2026-06-14', [A('Departure brunch', 'food', '10:00', { durationMins: 60 })]),
  ]),
  T('A full day with no meal planned', [
    day('Day 1', FRI, [
      A('Morning museum', 'activity', '09:00', { durationMins: 120 }),
      A('Afternoon walk', 'activity', '12:00', { durationMins: 120 }),
      A('Late gallery', 'activity', '15:00', { durationMins: 90 }),
    ]),
  ]),
  T('Dietary conflict — veg & no-alcohol families, meat & cocktail stops', [
    day('Day 1', FRI, [
      A('meat', 'food', '13:00', { name: 'BBQ Steakhouse', durationMins: 90 }),
      A('alco', 'food', '20:00', { name: 'Rooftop Cocktail Bar', durationMins: 90 }),
    ]),
  ], { families: [
    { id: 'fVeg', name: 'Greens', dietary: ['vegetarian'], members: [] },
    { id: 'fDry', name: 'Sober', dietary: ['no-alcohol'], members: [] },
  ] }),
  T('Hotel change — first hotel booked past the next check-in', [
    day('Day 1', FRI, [A('Great Wolf Lodge', 'stay', '15:00', { name: 'Great Wolf Lodge', nights: 2, lat: 0, lng: 0 })]),
    day('Day 2', '2026-06-13', [A('The Baywatch Resort', 'stay', '15:00', { name: 'The Baywatch Resort', nights: 1, lat: 0, lng: 0 })]),
    day('Day 3', '2026-06-14', [A('Last morning', 'activity', '10:00', { durationMins: 60 })]),
  ]),
  T('Day 1 starts far from the trip origin', [
    day('Day 1', FRI, [A('Far Stop', 'activity', '08:30', { durationMins: 120, lat: 0, lng: 5 })]),
  ], { origin: { label: 'Home City', lat: 0, lng: 0 } }),
  T('A very packed day (8 stops, no food)', [
    day('Day 1', FRI, Array.from({ length: 8 }, (_, k) =>
      A(`s${k}`, 'activity', `${String(7 + k).padStart(2, '0')}:00`, { name: `Stop ${k + 1}`, durationMins: 30 }))),
  ]),
  T('The same activity added twice', [
    day('Day 1', FRI, [
      A('d1', 'activity', '10:00', { name: 'City Tour', durationMins: 60 }),
      A('d2', 'activity', '15:00', { name: 'City Tour', durationMins: 60 }),
    ]),
  ]),
  T('A rest day (notes only)', [
    day('Day 1', FRI, [A('n1', 'note', null, { name: 'Free day — recover by the pool' })]),
  ]),
  T('Edge hours — pre-dawn start & a show past midnight', [
    day('Day 1', FRI, [
      A('Sunrise viewpoint', 'activity', '05:00', { durationMins: 90 }),
      A('Late show', 'activity', '23:00', { durationMins: 120 }),
    ]),
  ]),
  T('A few-but-long touring day (tiring)', [
    day('Day 1', FRI, [
      A('hk', 'activity', '08:00', { name: 'Full-day excursion', durationMins: 480 }),
      A('pk', 'activity', '17:00', { name: 'Evening park', durationMins: 180 }),
    ]),
  ]),
  T('Overnight journey (arrives next morning)', [
    day('Day 1', FRI, [A('tr', 'transport', '22:00', { name: 'Night train', subtype: 'train', arriveTime: '06:00' })]),
  ]),
  T('Stop before a late-rising family is up', [
    day('Day 1', FRI, [A('w', 'activity', '08:00', { name: 'Morning museum', durationMins: 60 })]),
  ], { families: [{ id: 'fOwl', name: 'Owls', wakeTime: 'late', members: [] }] }),
  T('A timeless venue that can’t fit its open hours', [
    day('Day 1', FRI, [
      A('booked', 'activity', '10:00', { name: 'All-day pass', durationMins: 120 }),
      A('squeeze', 'activity', undefined, { name: 'Local Gallery', openHours: [{ d: 5, o: 540, c: 1020 }] }),
    ]),
  ]),
  T('Google business status — permanently / temporarily closed', [
    day('Day 1', FRI, [
      A('gone', 'activity', '10:00', { name: 'Old Cafe', durationMins: 60, businessStatus: 'CLOSED_PERMANENTLY' }),
      A('maybe', 'activity', '14:00', { name: 'Renovating Museum', durationMins: 60, businessStatus: 'CLOSED_TEMPORARILY' }),
    ]),
  ]),
  T('A full-day venue with other stops crammed in', [
    day('Day 1', FRI, [
      A('pk', 'activity', '09:00', { name: 'Theme Park', durationMins: 480 }),
      A('o1', 'activity', '10:00', { name: 'Side museum', durationMins: 60 }),
      A('o2', 'activity', '11:00', { name: 'Cafe stop', durationMins: 60 }),
    ]),
  ]),
  T('A 6h+ journey crammed with other stops', [
    day('Day 1', FRI, [
      A('Flight', 'transport', '08:00', { subtype: 'flight', durationMins: 420 }),
      A('Museum', 'activity', '15:00', { durationMins: 120 }),
      A('Dinner', 'food', '19:00', { durationMins: 90 }),
    ]),
    day('Day 2', '2026-06-13', []),
  ]),
  T('Two cities tagged on one day', [
    day('Day 1', FRI, [
      A('Louvre', 'activity', '10:00', { durationMins: 120, city: 'Paris' }),
      A('Basilica', 'activity', '14:00', { durationMins: 60, city: 'Lyon' }),
    ]),
  ]),
];

// ── Severity styling ────────────────────────────────────────────────────────────────
const SEV = {
  error:   { label: 'ERROR',   bg: '#fdeceb', fg: '#b42318', bd: '#f3b4ae' },
  warning: { label: 'WARNING', bg: '#fdf3e2', fg: '#92400e', bd: '#f0d9a8' },
  info:    { label: 'INFO',    bg: '#eef2f8', fg: '#3b5168', bd: '#cdd9e8' },
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Run the engine over every sample.
const runs = SAMPLES.map(t => ({ trip: t, warnings: validateTrip(t) }));

// ── Split / settlement engine (costs.js) — resolved shares over sample expenses ──────
// Two paying families (Aye: A1+A2, head A1 · Bee: B1) + an EMPTY family (no members) to show
// the no-leak guard. Every number below is computed by the REAL costs.js functions.
const famAye = { id: 'A', name: 'Aye', members: [{ id: 'A1', name: 'Avery' }, { id: 'A2', name: 'Ada' }] };
const famBee = { id: 'B', name: 'Bee', members: [{ id: 'B1', name: 'Bo' }] };
const famEmpty = { id: 'C', name: 'Empty', members: [] };
const splitFams = [famAye, famBee, famEmpty];
const sexp = (o) => ({ amount: 0, participatingFamilies: ['A', 'B', 'C'], participatingMembers: null, excluded: false, ...o });
const memberName = { A1: 'Avery', A2: 'Ada', B1: 'Bo' };

const SPLIT_SCENARIOS = [
  { name: 'Individual, even — $90 dinner, everyone in (Avery paid)', exp: sexp({ amount: 90, paidBy: 'A1' }) },
  { name: 'Family mode, even — $100 hotel split by group (C is empty → pays $0)', exp: sexp({ amount: 100, splitMode: 'family', paidBy: 'A1' }) },
  { name: 'Family mode, UNEVEN — Aye $70 / Bee $30 (custom, balanced; Bo paid)', exp: sexp({ amount: 100, splitMode: 'family', unevenSplit: true, customShares: { A: 70, B: 30 }, paidBy: 'B1' }) },
  { name: 'Individual, narrowed — $40, only Avery & Bo (Avery paid)', exp: sexp({ amount: 40, participatingMembers: ['A1', 'B1'], paidBy: 'A1' }) },
];

const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const splitRuns = SPLIT_SCENARIOS.map(({ name, exp }) => {
  const trip = { families: splitFams, splitMode: 'individual', expenses: [exp], days: [] };
  const mode = resolveMode(exp, trip);
  const perFamily = splitFams.map(f => ({ name: f.name, owes: famExpenseShare(f, exp, trip) }));
  const members = splitFams.flatMap(f => f.members);
  const perMember = members.map(m => ({ name: memberName[m.id] || m.id, owes: memberExpenseShare(m, exp, trip) }));
  const settlements = calcSettlements(calcBalances(trip))
    .map(s => `${memberName[s.from.id] || s.from.id} → ${memberName[s.to.id] || s.to.id} ${money(s.amount)}`);
  return { name, amount: exp.amount, mode, perFamily, perMember, settlements };
});

// Catalog: one row per distinct warning type, with a real example pulled from the runs.
const catalog = {};
runs.forEach(({ warnings }) => warnings.forEach(w => {
  if (!catalog[w.type]) catalog[w.type] = w;   // first sighting = the example
}));
const SEV_ORDER = { error: 0, warning: 1, info: 2 };
const catalogRows = Object.values(catalog)
  .sort((a, b) => (SEV_ORDER[a.severity] - SEV_ORDER[b.severity]) || a.type.localeCompare(b.type));

// ── Render ──────────────────────────────────────────────────────────────────────────
const sevBadge = (sev) => {
  const s = SEV[sev] || SEV.info;
  return `<span class="badge" style="background:${s.bg};color:${s.fg};border-color:${s.bd}">${s.label}</span>`;
};
const warnCard = (w) => {
  const s = SEV[w.severity] || SEV.info;
  return `<div class="warn" style="background:${s.bg};border-color:${s.bd}">
    <div class="warn-head">${esc(w.icon || '•')} <b style="color:${s.fg}">${esc(w.title || w.type)}</b> ${sevBadge(w.severity)}
      <code>${esc(w.type)}</code>${w.dayIndex != null ? `<span class="day">Day ${w.dayIndex + 1}</span>` : '<span class="day">trip</span>'}</div>
    <div class="warn-msg">${esc(w.message)}</div>
    ${w.hint ? `<div class="warn-hint">💡 ${esc(w.hint)}</div>` : ''}
  </div>`;
};

const catalogHtml = catalogRows.map(w => `<tr>
  <td>${sevBadge(w.severity)}</td>
  <td><code>${esc(w.type)}</code></td>
  <td>${esc(w.icon || '')} ${esc(w.title || '')}</td>
  <td class="ex">${esc(w.message)}${w.hint ? `<div class="warn-hint">💡 ${esc(w.hint)}</div>` : ''}</td>
</tr>`).join('\n');

const samplesHtml = runs.map(({ trip, warnings }) => {
  const counts = warnings.reduce((m, w) => (m[w.severity] = (m[w.severity] || 0) + 1, m), {});
  const summary = ['error', 'warning', 'info'].filter(s => counts[s]).map(s => `${counts[s]} ${SEV[s].label.toLowerCase()}`).join(' · ') || 'all clear ✓';
  const dayList = trip.days.map(d => `${esc(d.label)}: ${d.activities.length ? d.activities.map(a => esc(a.name)).join(', ') : '(empty)'}`).join('<br>');
  const cards = warnings.length ? warnings.map(warnCard).join('\n') : '<div class="clean">No warnings — clean ✓</div>';
  return `<section class="sample">
    <h3>${esc(trip.name)} <span class="summary">${summary}</span></h3>
    <div class="days">${dayList}</div>
    ${cards}
  </section>`;
}).join('\n');

const splitHtml = splitRuns.map(r => `<section class="sample">
  <h3>${esc(r.name)} <span class="summary">mode: ${esc(r.mode)} · total ${money(r.amount)}</span></h3>
  <div class="days"><b>Per family:</b> ${r.perFamily.map(f => `${esc(f.name)} ${money(f.owes)}`).join(' · ')}</div>
  <div class="days"><b>Per person:</b> ${r.perMember.map(m => `${esc(m.name)} ${money(m.owes)}`).join(' · ')}</div>
  ${r.settlements.length ? `<div class="settle">⇄ ${r.settlements.map(esc).join(' · ')}</div>` : '<div class="clean">no transfers needed</div>'}
</section>`).join('\n');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kithova — Trip Check rule report</title>
<style>
  :root { --ink:#1c1714; --body:#43382f; --subtle:#8a7d72; --bg:#f7f5f2; --card:#fff; --line:#ece4da; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:var(--body); background:var(--bg); }
  .wrap { max-width:880px; margin:0 auto; }
  h1 { color:var(--ink); font-size:26px; margin:0 0 4px; }
  h2 { color:var(--ink); font-size:18px; margin:32px 0 12px; border-bottom:2px solid var(--line); padding-bottom:6px; }
  h3 { color:var(--ink); font-size:15px; margin:0 0 8px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .meta { color:var(--subtle); font-size:13px; margin-bottom:8px; }
  .note { background:#fffaf2; border:1px solid #f0d9a8; border-radius:10px; padding:10px 14px; font-size:13px; color:#92400e; margin:12px 0 0; }
  table { width:100%; border-collapse:collapse; background:var(--card); border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th,td { text-align:left; padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; font-size:13px; }
  th { background:#faf7f3; color:var(--subtle); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  td.ex { color:var(--body); }
  code { background:#f0ede8; border-radius:4px; padding:1px 5px; font-size:12px; color:#5b4a3c; }
  .badge { font-size:10px; font-weight:800; padding:1px 7px; border-radius:999px; border:1px solid; letter-spacing:.4px; }
  .sample { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:14px; }
  .summary { color:var(--subtle); font-size:12px; font-weight:600; }
  .days { color:var(--subtle); font-size:12.5px; margin-bottom:10px; line-height:1.6; }
  .warn { border:1px solid; border-radius:9px; padding:9px 12px; margin-top:8px; }
  .warn-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:14px; }
  .warn-msg { margin-top:4px; font-size:13px; }
  .warn-hint { margin-top:3px; font-size:12px; color:var(--subtle); }
  .day { margin-left:auto; font-size:11px; color:var(--subtle); background:#faf7f3; padding:1px 7px; border-radius:999px; }
  .clean { color:#0e9f6e; font-size:13px; font-weight:600; }
  .settle { margin-top:6px; font-size:13px; font-weight:700; color:#4b3fae; background:#eeecfc; border-radius:8px; padding:6px 10px; }
</style></head>
<body><div class="wrap">
  <h1>Kithova — rule engines</h1>
  <div class="meta">Generated by <code>scripts/gen-rule-report.js</code> from the REAL <code>validateTrip()</code> (Trip Check) and <code>costs.js</code> (split/settlement) over illustrative samples. Re-run anytime: <code>npm run rule-report</code>.</div>
  <div class="note">These samples are for reading each engine's behavior — they are <b>not</b> the test fixtures. The authoritative behavior locks are <code>tripValidator.snapshot.test.js</code> (golden snapshots), <code>hotelOverlap.test.js</code>, and <code>costs.test.js</code>.</div>

  <h2>① Trip Check — rule catalog (${catalogRows.length} warning types seen)</h2>
  <table><thead><tr><th>Tier</th><th>Type</th><th>Title</th><th>Example (message · hint)</th></tr></thead>
  <tbody>${catalogHtml}</tbody></table>

  <h2>Trip Check — sample trips → warnings</h2>
  ${samplesHtml}

  <h2>② Split / settlement engine — resolved shares (costs.js)</h2>
  <div class="meta">Families: <b>Aye</b> (Avery + Ada, head Avery) · <b>Bee</b> (Bo) · <b>Empty</b> (no members → never owes, so the books can't leak). Every figure below is computed by the real <code>famExpenseShare</code> / <code>memberExpenseShare</code> / <code>calcSettlements</code>.</div>
  ${splitHtml}
</div></body></html>`;

const out = path.join(__dirname, '..', 'docs', 'rule-report.html');
fs.writeFileSync(out, html);
console.log(`wrote docs/rule-report.html — ${catalogRows.length} Trip Check rule types over ${SAMPLES.length} samples + ${splitRuns.length} split scenarios`);
