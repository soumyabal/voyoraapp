# Autonomous Work Log

> A plain, chronological record of what the background loop ships while the user is away.
> One line per item: `- YYYY-MM-DD — what changed (commit)`. Git history is the source of
> truth; this is the human-scannable summary. The roadmap lives in `docs/product-roadmap.md`.

## 2026-06-04 — session kickoff (foreground, before the loop took over)
- 2026-06-04 — eslint jest-globals fix (lint 559→196) + CI workflow + track babel/eslint configs (f028e28)
- 2026-06-04 — trip lifecycle: trips open on the phase-correct day, no stale "Day 2" (5494ea3)
- 2026-06-04 — roadmap: review score, GTM, ship timeline, monetization, lifecycle + notifications (13028ce, 4cf7111)

## Background loop entries (appended by each autonomous run)
<!-- newest at the bottom -->
- 2026-06-04 — trip status pill + phase-aware day chips (f704b0d) ✓ verified on device ("📅 In 8 days" renders for the upcoming Wisconsin trip)
- 2026-06-04 — 2-opt route refinement in scheduleDay/autoArrange (engine, unit-tested)
- 2026-06-04 — "Today" lens: now/next banner + jump-to-today for active trips (engine+UI; active visuals pending an active-dated trip) 
- 2026-06-04 — tiring_day Trip-Check tip (few-but-long day, hours-on-your-feet) (dfd1449)
- 2026-06-04 — fixed 3 real lint-surfaced bugs: Discover reverseGeocode crash + 2 dead-style dupe keys (83b58de)
- 2026-06-04 — feature buckets doc: all forward work organized before/during/after the trip (6f32871)
- 2026-06-04 — DURING: per-family running tally on the Today view (calcFamilyBalances, 4 tests) (21f73fc); status pill re-verified on device, active-state render still pending an active-dated trip
- 2026-06-04 — BEFORE: "Plan my day" now makes a day TIME-feasible (comfortPass — clears the meal→far-sight travel leg scheduleDay's per-type passes miss) + a PREVIEW-DIFF the user Applies/Discards (panel-reviewed, user chose preview). ✓ verified on device; device testing caught & fixed a midnight-wrap bug (29:50→05:50) → now honest "won't fit in one day". 156 tests
- 2026-06-04 — "respect real time / lock what's booked / warn what's risky" (panel-reviewed, user chose Lock+check-in/out): timeLocked + 🔒 pin (lock-on-exact-time, engine anchors it) ✓ device-verified · real hotel check-in/out times the planner respects (default 3pm/11am, store v3→v4) ✓ device-verified · calm "check out by X" tip. 163 tests
- 2026-06-04 — last-day "Heading home?" one-tap return-journey draft (panel-reviewed; user chose one-tap-draft over silent auto-create): returnJourneyDraft pre-fills ONLY known facts (home origin, mirrored arrival mode), never a cost (protects the split), find-or-update so no duplicate; [Add return]/[Not now] card on the last day; check-out stays derived. ✓ device-verified end-to-end. 169 tests
