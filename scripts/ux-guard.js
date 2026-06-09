#!/usr/bin/env node
/*
 * ux-guard.js — the safety gate for UX work (autonomous or partner-led).
 *
 * A UX revamp must be PRESENTATION-ONLY: screens / modals / components / theme. This guard makes
 * that mechanical instead of a promise. It FAILS if a change touches the rule/money ENGINE, then
 * runs the full test suite (incl. the golden snapshots) — so "rules + testcases tight" is enforced,
 * not trusted.
 *
 *   node scripts/ux-guard.js                 # checks working tree + staged vs HEAD (use before a commit)
 *   node scripts/ux-guard.js origin/main..HEAD   # checks a commit range (use before a push/PR)
 *
 * Exit 0 = engine untouched AND all tests + snapshots green → safe to ship UI work.
 * Exit 1 = an engine file was touched, OR a test/snapshot is red → STOP.
 */
const { execSync } = require('child_process');

// The decoupled engine — the rules + the money moat + the persisted shape. UX work never edits these.
// (A genuine engine change is fine — but it must be its OWN commit with the full tripwire, not bundled
// into a UI diff. That's the whole point: keep the placer/checker and the split logic provably stable.)
const PROTECTED = [
  'src/utils/tripValidator.js', // Trip Check rule registry
  'src/utils/autoArrange.js',   // scheduleDay / planDay placer
  'src/utils/costs.js',         // split engine — the moat
  'src/utils/expenses.js',      // itinerary → expense linkage
  'src/utils/geo.js',           // haversine / travel model
  'src/utils/hours.js',         // opening-hours model
  'src/utils/tz.js',            // timezone engine
  'src/utils/slots.js',         // day-slot math
  'src/store/',                 // store actions + money invariants + persisted shape
];

function changedFiles(range) {
  const cmd = range ? `git diff --name-only ${range}` : 'git diff --name-only HEAD';
  try {
    return execSync(cmd, { encoding: 'utf8' }).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

const range = process.argv[2];
const changed = changedFiles(range);
const touched = changed.filter((f) => PROTECTED.some((p) => f === p || f.startsWith(p)));

if (touched.length) {
  console.error('\n✖ UX-guard: this change touches the rule/money ENGINE:');
  touched.forEach((f) => console.error('    • ' + f));
  console.error('\n  A UX revamp must be presentation-only (screens / modals / components / theme).');
  console.error('  If an engine change is truly intended, make it its OWN commit with the full');
  console.error('  tripwire (jest + snapshots + lint) — never bundle it into UI work.\n');
  process.exit(1);
}

console.log('✓ UX-guard: no engine files touched. Running the test suite + snapshots…\n');
try {
  execSync('npx jest --silent', { stdio: 'inherit' });
} catch {
  console.error('\n✖ UX-guard: tests / snapshots are NOT green. Fix before committing UI work.\n');
  process.exit(1);
}
console.log('\n✓ UX-guard PASSED — engine untouched + every test + snapshot green. Safe to ship the UI change.\n');
