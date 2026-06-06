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

## Part 3 — Recommendation (revised per owner, June 2026): a conflict-anchored **ripple resolver**, NOT a global re-plan

> ⚠️ **Supersedes the earlier "Plan my trip" idea.** Do NOT build a one-tap global auto-planner.

### Why global auto-plan is the wrong tool (owner's hard-won experience)
The app targets trips **up to 21 days**. A from-scratch `autoArrange`/"plan everything" pass was tried and hit **structural failure modes the engine couldn't manage**: overnight drives, a night with **no stay**, a day with **no starting point/anchor**, multi-day journeys, and more. The reason is fundamental: a global planner has to *derive all the structural scaffolding* — where you sleep each night, where each day starts, how multi-day legs connect — and on a 21-day, multi-family, multi-city trip there are too many edge cases to get right. **Rejected. Don't rebuild it.**

### The right tool: local, incremental ripple resolution
The user is (rightly) the author of the plan. When Trip Check flags **one** conflict and suggests a concrete nudge ("move X by ~30 min" / "X starts before you can realistically get there"), let the user accept it and have the engine **cascade only the affected, movable stops into the next available slots — preserving the user's order, honoring Travel + Open-Hour rules, and treating every structural anchor as IMMUTABLE.**

So instead of "re-plan the trip," it's **"I nudged this one stop — now smartly re-flow the knock-on stops so the day stays feasible."**

### The contract (this is the whole design)
- **IMMUTABLE — never moved, never derived** (these are exactly the things the global planner kept getting wrong, so the resolver simply doesn't touch them): locked stops (`timeLocked`), the day's **stay / check-in**, **overnight transit**, **transport-with-a-time**, the **day-start anchor** (where you wake — `dayStartAnchor`), and **window-anchored** stops (sunrise/sunset/nightlife).
- **MOVABLE:** the un-pinned daytime activities only.
- **The cascade (order-preserving, NOT a re-order):** from the changed stop, walk forward in the user's **current order**; push each movable stop to `max(prevStopEnd + travelLeg(prev → this), the stop's next OPEN interval that day)`, clamped to the day's end. Keep the order the user chose — only shift *times* to feasibility. (This is the key difference from `scheduleDay`, which re-orders nearest-neighbour and can fight the user's intent.)
- **Can't fit before it closes?** Don't cram. Surface a one-tap **decision card** — *"Doesn't fit today → move to another day · keep anyway · remove"* — reusing today's `noFitHours` signal.
- **Preview + Apply/Discard** (reuse the `planDay` preview-diff so the user sees "moved 3 later stops" before committing), and **convergent** (re-running on an already-feasible day is a no-op).

### Why this is trustworthy where global wasn't
- **Tiny, predictable blast radius** — one day, only the tail after the edit, only movable stops. No chance of inventing/dropping a stay or losing a day's anchor, because it never edits those.
- **The user stays the author** — their order and every structural decision are preserved; the engine only relieves the tedium of re-timing the knock-on stops.
- **Every action is conflict-anchored + explainable** — invoked on a specific flagged problem with a concrete fix; the result reads as "moved Pier and Park later to keep travel + hours feasible," not a mysterious re-plan.

### Where it plugs into the existing engine (the pieces already exist)
- `geo.travelLeg` (travel feasibility) · `hours.dayIntervals`/`isOpenAt` (open-hour windows) · `slots`/`timeToMin` (slotting) · the *feasibility-sweep idea* from `comfortPass` — but applied **order-preserving and anchor-respecting**, not via `scheduleDay`'s nearest-neighbour re-order.
- **Surface:** each Trip Check `error`/`warning` that re-timing can fix (overlap, travel-time-too-tight, a manual time edit that breaks the downstream) gets a **"Smart fix"** action → ripple → preview → apply. Soft `info` tips stay passive.

### Phasing (small, shippable, test-gated)
1. **Ripple from a manual edit** — when the user changes one stop's time and it makes the downstream infeasible (travel/hours), offer *"Shift the rest to fit"* → cascade the movable tail of that one day. The most common, most trusted case.
2. **"Smart fix" on a Trip Check conflict** — wire the same resolver to the overlap / travel-time / no-fit warnings as a one-tap fix on the day pill.
3. **Decision cards** for the residual (can't-fit-today, closed-that-day) — explicit one-tap choices, never silent.
- **Explicitly out of scope:** a global "plan the whole trip" button.

### Guardrails (unchanged)
- **Never touch the split/moat** — the resolver only re-times movable stops; costs follow per-family as today.
- **Anchors are immutable** (stays, overnight transit, day origin, locked/window stops) — this is what keeps it from reproducing the global-planner failures.
- **Deterministic + golden-snapshot-gated** (`tripValidator.snapshot.test.js`, autoArrange/planDay tests). Stays a rule engine, not an LLM.
- **Only auto-move the unambiguous**; anything else is an explicit choice. Heavy UI → build behind the tripwire and **device-verify** (AGENTS.md "Field-tested workflow").

---

*One line: don't re-plan the trip — when the user accepts a single nudge, let the engine ripple just the movable downstream stops into feasible (travel + open-hours) slots, leaving every structural anchor exactly where the user put it. Local, explainable, and immune to the overnight-drive / missing-stay / no-day-start failures that sank the global planner.*
