# Plan My Day ↔ Trip Check — how they work, why it feels like a cycle, and the path to a one-go "Plan my trip"

> Owner insight (June 2026): *"It goes in a cycle. There must be a better way of organizing all things in one go and making the planner with a WOW feeling — this is where users either adopt or drop the app."* This doc (1) documents both engines as they exist today, (2) names the structural reason for the cycle, and (3) proposes the redesign. **No engine code is changed by this doc.**
>
> Companion docs: `trip-check-rules.md` (full rule catalog), `intelligent-planner.md` (rule-engine ethos), `engine-architecture.md`. Source: `src/utils/tripValidator.js`, `src/utils/autoArrange.js`, surfaced in `src/screens/ItineraryScreen.js` + `src/utils/tripCheckStatus.js`/`tripHealth.js`.

---

## Part 1 — The engine today

### A. Trip Check = the **diagnostician** (`tripValidator.js`)

`validateTrip(trip)` runs a **pure rule registry**: `buildDayContext(day, i, families)` computes shared per-day state once, then every rule is a pure `(ctx|trip) → warning[]` function. Output is byte-for-byte locked by `tripValidator.snapshot.test.js` (every rule has a fixture).

**Severity is deliberately tiered** (the calm-not-a-wall-of-red doctrine):
- `error` — a **provable** conflict (venue closed that day/time, permanently closed, 6h+ journey, a known-hours venue that literally can't fit). Only these are "hard."
- `warning` — **data-backed** but not provable (a real overlap, a long travel leg).
- `info` — a **heuristic/estimate** tip (packed day, tiring day, wake-time, dietary, duplicate). The duration/distance model is approximate, so guesses stay soft.

**The 20 rules:**
- **DAY_RULES (14):** `ruleNoFit` · `ruleOverlap` · `ruleTravelTime` · `ruleFullDayVenue` · `rulePacked` · `ruleTiringDay` · `ruleTimelineEdges` · `ruleMultiDayJourney` · `ruleWakeTime` · `ruleDietary` · `ruleDuplicate` · `ruleMultiCity` · `ruleBusinessStatus` · `ruleClosedVenue`.
- **TRIP_RULES (6):** `ruleFirstStopUnreachable` · `ruleEmptyDays` · `ruleUnbookedNights` · `ruleCheckOutBy` · `ruleLastDayCheckout` · `ruleLongJourney`.

**How it surfaces:** one calm per-day **pill**, calm day-chip **health dots** (`tripHealth.computeTripHealth` → empty/conflict/check/tip/clean), and a 3-state **trip badge** (`tripCheckStatus` → `fix`/`look`/`building`/`clear`). Ignorable per-warning. It **only diagnoses** — it never changes the plan.

### B. Plan My Day = the **fixer** (`autoArrange.js`)

- **`scheduleDay(activities, opts)`** — pure placement, in passes: locked stops are fixed anchors → transport-with-a-time anchors the day → stays land at the hotel's real check-in/out → meals fall into a window the place is actually *open* for → window-anchored activities (sunrise/sunset/nightlife) → remaining daytime activities ordered **nearest-neighbour → bounded 2-opt → comfort-first close-time pass**, placed **opening-hours-aware**. A known-hours venue with no free open slot is **left unscheduled (`time=null`), never crammed past close.**
- **`comfortPass`** — a sweep that makes cross-type travel legs feasible (the breakfast → far-sight gap the per-type passes miss).
- **`planDay`** = `comfortPass(scheduleDay(...))` + **honest triage**, returning:
  - `scheduled` (the re-timed day to write), `changed` (did any (id,time) move? → **convergence**: `changed=false` ⇒ calm "already arranged", never a re-prompt),
  - `changes[]` (the explicit preview diff the UI shows for **Apply / Discard**),
  - `overflow[]` (substantial stops beyond the pace cap — *reported, kept, not dropped*),
  - `noFitHours[]` (left unscheduled because hours don't fit — "move to another day"),
  - `unresolved`/`closed[]` (re-timing can't open a dark/closed venue — it **reuses `validateTrip`**, so "one engine places + checks").
- **`autoArrange`** — basket (Discover) → days.

**Key truth:** Plan My Day **re-times and re-orders within a single day**. It does **not** delete, does not move across days, and does not resolve closures/overflow — it **reports them back** for the user to handle.

---

## Part 2 — Why it feels like a cycle (the root cause)

The two systems are healthy individually but the **interaction loops** because:

1. **Two actions, two mental models.** Trip Check = *diagnose*; Plan my day = *fix*. The user must ping-pong: read warnings → invoke the fixer → re-read warnings.
2. **The fixer is day-scoped.** `planDay` operates on one day. A 5-day trip = run it 5 times, checking between each.
3. **The fixer only fixes *timing*.** Overflow, closed-day venues, and no-fit-hours are **reported, not resolved** — so after Plan my day the user still has to manually move/delete, which re-triggers Trip Check.
4. **Diagnosis re-runs after every manual edit**, so the red/amber state keeps re-appearing as the user nibbles at it one stop at a time.

Net loop: **add places → Trip Check lights up → Plan my day (one day) → still flagged → manually move/delete → Trip Check re-lights → Plan next day → …** It never resolves "in one go," so it reads as churn instead of progress. That's the adopt-or-drop moment.

---

## Part 3 — Recommendation: collapse the loop into one proactive pass

**Principle: diagnose and resolve *together*, trip-wide, in one reviewable pass. Trip Check becomes ambient (a passive health signal), not an action you invoke.**

### The WOW flow — "✨ Plan my trip" (one tap, whole trip)
One primary button. It:
1. Runs `planDay` across **every day** (loop the existing engine), then
2. **Auto-resolves everything the engine legitimately can** (see ladder below), then
3. Presents **ONE preview**: *"Here's your plan. I arranged N days, fixed X, and moved Y. **2 things need your call.**"* — Apply / Discard the whole thing, with the 2 decisions inline.

This converts "check → fix → check → fix…" into **"plan → review → done."** Re-tapping a clean trip yields **"All set ✨"** (convergence already exists in `planDay`'s `changed` flag — extend it trip-wide), so the badge goes green and *stays*.

### Auto-resolution ladder (what the engine resolves WITHOUT asking)
Today these are *reported*; the upgrade is to *act* on the unambiguous ones:
- **Re-time + re-order every day** — already done by `planDay`; just run it for all days.
- **Redistribute overflow** — a day beyond its pace cap pushes its lowest-priority extra stop to the nearest **lighter day in the same city** (extend `autoArrange`'s basket logic to operate cross-day, respecting `ruleMultiCity`).
- **Re-day a closed-day visit** — a venue closed on its scheduled day but open on another day of the trip → propose moving it there (the data is already in `ruleClosedVenue` + `openHours`).
- **Fill obvious gaps** — an empty planned day with nearby high-quality Discover stops (only if the user opts in; never silent invention).

### The few REAL human decisions → decision cards, not warnings
Whatever the engine *can't* resolve unambiguously becomes a **one-tap choice**, surfaced in the plan result (not as a vague amber pill):
> 🔒 *"Circus World is closed Monday. **Move to Tuesday** · Keep anyway · Remove."*

This is the inversion: **info-tips become either a silent fix or an explicit decision.** The user is never asked to go re-open a separate checker and interpret severity colours.

### What Trip Check becomes
- Stays as the **ambient** calm pill + the detailed checker for power users — but it's the *output state* of the planner, not the thing you bounce to. After "Plan my trip," the badge should read **clear/green** because the planner already consumed the actionable warnings.

### First-run aha (the retention moment)
Open app → pre-built 2-family demo trip → **one tap "✨ Plan my trip"** → watch a beautiful, feasible, *fair* multi-day plan resolve in one motion (timings, routing, the per-family split). That single tap is the "this app is smart" moment — make it the hero of onboarding.

### Suggested phasing (each shippable, test-gated, behavior-preserving where it can be)
1. **Trip-wide planDay** — "Plan my trip" loops `planDay` over all days into ONE preview-diff. Small; reuses the engine; unit-testable. *Biggest single UX win.*
2. **Cross-day overflow redistribution** — move capacity overflow to lighter same-city days. Engine + tests.
3. **Decision cards** — closed-day re-day / keep / remove as one-tap choices in the result.
4. **Fold Trip Check into the result** — the planner's output screen shows "handled / your call / all clear"; the standalone checker recedes to a detail view.

### Guardrails for whoever builds this
- **Never let the planner touch the money/split** (the moat) — it arranges days; costs follow per-family as they do today.
- **Keep it deterministic + golden-snapshot-gated** (`tripValidator.snapshot.test.js`, the autoArrange/planDay tests). The planner stays a rule engine, not an LLM.
- **Auto-resolve only the unambiguous**; everything else is an explicit user choice. Never silently delete or invent.
- This is heavy UI → build behind the tripwire and **device-verify** (see AGENTS.md "Field-tested workflow").

---

*One line: today the user is the integration layer between a diagnostician and a per-day fixer. The win is to make the engine do that integration — one tap, whole trip, auto-resolve the unambiguous, ask once for the rest — so "plan → review → done" replaces "check ↔ fix."*
