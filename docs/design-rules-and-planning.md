# Voyara — Rule Engines, Discover & Planning: Design Proposal

> Product-designer proposal across six areas the owner raised, plus engineering
> feasibility notes. Companion to `docs/project-review.md` and
> `docs/product-findings.md`. Philosophy held throughout: every rule is a small,
> named, pure, **unit-testable** function — deterministic heuristics, NOT an LLM
> (explainable, instant, offline, free).

---

## 1. Auto-arrange — complete heuristic catalog

The core bug: every non-meal flows from `09:00` ([autoArrange.js:281](../src/utils/autoArrange.js#L281)), so a hotel `stay` lands in the morning. Meals already get windows ([:269-278](../src/utils/autoArrange.js#L269-L278)) — **generalize that to all types.**

**Phase A — Day-role classification (once, up front):** `classifyArrivalDay` (day 0 = arrival if inbound transport or no prior stay), `classifyDepartureDay` (last day), `classifyRestDay` (trips ≥7 days → a rest day every 4th active day), `classifyCityLeg` (group consecutive days by dominant city).

**Phase B — Per-type time windows** (the headline change), `TYPE_WINDOWS[(type, dayRole)]`:

| Type | Window (start→latest) | Anchor | Why |
|---|---|---|---|
| **stay check-in** (arrival day) | 15:00→18:00 | **16:00** | Standard hotel check-in; never morning |
| **stay check-out** (departure day) | 09:00→11:00 | **10:00** | Frees the morning |
| stay (mid-trip) | suppress | — | You don't re-check-in nightly |
| breakfast | 07:30→09:30 | 08:00 | Only on days with a check-in already |
| lunch | 12:00→14:00 | 12:30 | Keep current `LUNCH_MIN` |
| dinner | 18:00→20:30 | 19:00 | Keep current `DINNER_MIN` |
| show / nightlife / concert | 19:30→22:00 | 20:00 | keyword |
| sunrise | 05:30→07:00 | 06:00 | keyword |
| sunset / viewpoint | 17:30→sunset | 18:30 | keyword |
| general activity | 09:00→17:00 | flow 09:00 | current default, now bounded |
| transport in/out | keep user time, else 14:00 / 11:00 | — | arrival pm / departure midday |

**Phase C — Anchor the day on the hotel:** use the day's `stay` lat/lng as the nearest-neighbor anchor (`dayAnchor` exists, [:128](../src/utils/autoArrange.js#L128)); never schedule before check-in / after check-out.

**Phase D — Pacing & spacing:** keep `PACE_CAP` ([:32](../src/utils/autoArrange.js#L32)); make active-budget pace-relative (relaxed 6h / moderate 8h / packed 10h); **travel-time spacing** `bufferMin = clamp(distKm*3, 15, 90)` (today a flat 15 min); front-load the longest activity earliest.

**Phase E — Calendar-aware hints (no external data, use `day.date`):** `mondayMuseumRisk` (museum on a Monday → info "many museums close Mondays"), weekend-market / weekend-nightlife soft biases. Surfaced as preview hints, never hard blocks.

**Engine sequence:** classifyDays → pinned → full-day venues → **stays (new window phase)** → cluster-by-city → assign days → meals → **assign-times-by-window (replaces the 09:00 packer)** → travel spacing → feasibility hints → validate.

*Rejected:* a constraint-solver (slow, unexplainable — violates the instant/explainable contract).

---

## 2. Trip-Check — complete warning catalog

**Anti-nag principle:** over-warning is the failure mode. Two guardrails: severity discipline (`error`=breaks the day, `warning`=likely problem, `info`=FYI, dismissible, NOT counted in the headline badge) and suppression (a noted rest day suppresses empty-day, etc.). The headline badge ([tripValidator.js:548](../src/utils/tripValidator.js#L548)) should count **errors+warnings only**.

**New SLOT/GAP rules (the owner's ask — empty morning isn't caught today because `validateDay` bails on fully-empty days only, [:178](../src/utils/tripValidator.js#L178)):**

| Rule | Severity | Heuristic |
|---|---|---|
| `open_slot_morning` | info | active day, no morning item, not arrival/departure |
| `open_slot_evening` | info | active day, no evening item |
| `large_idle_gap` | **warning** | gap ≥180 min (pace-relative) with no meal/travel bridging |
| `slot_overflow` | info | one slot ≥4 activities while another is empty |

**Other new rules:** `day1_missing_arrival` (warning), `lastday_missing_checkout` (info), `hotel_no_checkin` (info), `checkin_too_early` (**warning** — catches the exact 09:00-hotel bug), `accessibility_conflict` (**warning** — needs `wheelchairOk` persisted onto activities; it's fetched at [DiscoverModal.js:136] but dropped on save at [:524]), `back_to_back_long_travel` (warning), `no_downtime_long_trip` (info), `budget_vs_pace` (info).

All slot/gap rules default to **info** so a 21-day trip doesn't generate dozens of nags.

---

## 3. Discover — list sorting (Bayesian)

Today sorts by `rating` only ([DiscoverModal.js:376](../src/modals/DiscoverModal.js#L376)) — a 5.0@3-reviews beats a 4.6@9000. `ratingCount` is already fetched ([:136](../src/modals/DiscoverModal.js#L136)) but unused.

**Recommended `rankScore` (True-Bayesian / IMDb-style):**
```
score = (v/(v+m))*R + (m/(v+m))*C
  R = place.rating, v = place.ratingCount, C = 3.9 (prior mean), m = 50 (prior weight)
```
At v=3 a 5.0 scores ~3.96 (loses to 4.6@9000 ≈ 4.60); at v=9000 the prior is negligible — exactly the requested behavior. Pure, trivially testable. Nulls sort last; ties break by ratingCount then distance.

**Secondary sorts (user-selectable):** Recommended (default) · Distance (from map center/hotel) · Price · Rating (raw) · Open-now (needs `places.regularOpeningHours` added to the field mask at [:115]; hide if absent).

**UI:** a single right-aligned **Sort ▾** dropdown in the `resultsBar` ([:671]) — the screen is already chip-heavy, and "Recommended" is right ~95% of the time.

---

## 4. Discover — map zoom

Today `fitBounds` over **all** pins ([DiscoverModal.js:256](../src/modals/DiscoverModal.js#L256)) → zooms way out with 60 merged pins.

**Recommended "frame the top-N, cluster the rest":** fit to the **top-12 by `rankScore`** (so sorting must land first — dependency), with **`maxZoom: 15`** and `padding [56,56]`; single result → `setView(pt, 15)`. **Marker clustering** via Leaflet `markercluster` (loads from the same unpkg CDN as Leaflet — Expo-Go-safe, no native dep); the rest collapse into numbered bubbles that expand on tap. **Progressive reveal:** render the top-12 immediately, reveal clusters after. Bigger pins (≥44×44 hit target — also the a11y fix). "Search this area" keeps the user's zoom (already does, via `fitToken`).

---

## 5. Planning model — day-by-day default + whole-trip auto-fill

**Day-by-day is the default frame.** Make Discover day-aware: launched from a day/slot (`dayIndex` already passed, [DiscoverModal.js:323]), it feels scoped to "fill *this* day" — 1-tap shortlist add, items land on that day, no day-picker in the common path.

**Whole-trip auto-fill:** a `✨ Plan the whole trip for me` CTA runs `autoArrange` over all days → the existing preview ([:815]) with **scope controls**: *Fill: All days / Empty days only* (default Empty-days-only when content exists — never disturbs hand-planned days, which `autoArrange` already merges around read-only), *Keep my existing activities* (on, non-negotiable), *Add estimated costs to Split* (on).

**Composition unblocker:** this is blocked until `applyArrangedActivities` creates expenses on a fresh trip — confirmed early-return at [store/index.js:851]. Fix: on apply with costed activities, auto-set `itineraryPushed=true` and run the existing `activityToExpense` rollup ([:857-862]); each expense gets `participatingFamilies=allFamilies`, per-person `costPerPerson`, frozen `estimatedAmount` (invariants #1-4). This removes the moat-bypass *and* makes auto-fill fund the per-family split automatically.

---

## 6. Three-week trips (≤21 days)

No max-day cap today ([NewTripModal.js:466]). A 21-day horizontal strip is unusable.

**Day navigation — recommended: Week tabs + 7-day strip + city-leg band.** Week 1/2/3 tabs (≤3); within a week a familiar 7-day strip; a city-leg band under the strip (from `classifyCityLeg`) makes a multi-city trip legible at a glance. Trips ≤7 days suppress week tabs (no weekend regression). (Alternatives: agenda list — good overview, loses focus; collapsible accordions — more taps.)

**Auto-arrange:** keep consecutive city days together (city legs); rest-day insertion; pace scales toward relaxed as length grows. **Trip-Check:** collapse repeated infos into one summary ("5 days have open mornings — auto-fill?") deep-linking to whole-trip auto-fill; downgrade interior empty-days to info on trips ≥14 days. **Performance (the ANR concentrates here):** `useStore` selectors, render only the active week (windowing), memoize `validateTrip` on `trip.days` identity (runs every render today) and the `ActivityCard`s. **Cap:** `MAX_TRIP_DAYS = 21` in the wizard.

---

## Prioritized roadmap (designer)

Dependencies: sorting → map-zoom; auto-arrange-creates-expenses → whole-trip auto-fill; per-type windows → several Trip-Check rules.

**P0 (core story):** 1) auto-arrange/apply **creates expenses** on fresh trips ([store/index.js:851]); 2) **per-type time windows** (check-in 16:00 etc.); 3) **Bayesian sort**.

**P1 (feels finished):** 4) map top-12 + maxZoom + clustering + ≥44pt pins; 5) Trip-Check slot/gap rules; 6) day-by-day IA + whole-trip auto-fill with scope controls; 7) sort UI.

**P2 (scale):** 8) 21-day support (week tabs + city-leg band + cap); 9) long-trip auto-arrange (rest days, legs, pace); 10) long-trip Trip-Check tuning; 11) performance pass (selectors, windowing, memoization) — must land with 21-day support or it ANRs; 12) accessibility-conflict rule (needs `wheelchairOk` persisted).

---

## Engineering feasibility notes (added by the engineering lead)

- **P0 trio is small and high-leverage — do it first as one tested pass.**
  - *Bayesian sort:* ~10-line pure `rankScore`; replace the sort at [DiscoverModal.js:376]. Trivial unit test (4.6@9000 > 5.0@3). **Low risk.**
  - *Per-type windows:* generalize the meal-window reservation already at [autoArrange.js:269-278] into a `TYPE_WINDOWS` table + seed `findSlotMin` with each item's window. The packer ([:261-293]) is the only block that changes. **Low-medium risk; fully unit-testable** (assert a Day-1 stay ≥ 15:00).
  - *Auto-arrange creates expenses:* the riskiest because it touches money — but the fix is small: stop the early-return at [store/index.js:851] and reuse the existing pushed-path rollup ([:857-862]). **Must ship with `costs.test.js` + a test asserting per-family expenses + net-to-zero** (the QA review already specced these).
- **Map clustering** adds a runtime CDN dependency (`leaflet.markercluster` from unpkg) — same trust model as the Leaflet/OSM assets already loaded; works in Expo Go (no native module). Acceptable; bundle locally later if offline matters.
- **`wheelchairOk` persistence** is a genuine one-liner at [DiscoverModal.js:524] (carry the field onto the activity) and unblocks the accessibility-conflict warning — high value for the accessibility wedge, near-zero cost.
- **21-day performance** is the one item that's real engineering effort, and it's coupled to the existing ANR fix (`useStore` selectors + memoize `validateTrip`). Treat "21-day support" and "the performance pass" as one workstream, not two.

---

*Voyara · design + engineering proposal · June 2026.*
