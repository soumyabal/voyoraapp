# Voyara — Tri-Lens Project Review (Engineering · Design · QA)

> Three independent reviews of the codebase — software engineering, product
> design (with a Discover redesign), and QA/testing — run June 2026. This is the
> synthesis: where they agree, the concrete bugs found, the Discover proposal,
> the test plan, and a sequenced roadmap. Companion to `docs/product-findings.md`.

---

## Executive summary

The **money engine and the agent pipeline are genuinely strong and well-factored**
(pure functions, centralized split math, `participatingFamilies` as source of
truth). The strengths to protect: per-family splitting/settlement and the
accessibility *domain modeling*.

All three lenses converge on the same headline: **the moat is gated behind an
undiscovered button, and the app's own chrome doesn't live up to its
accessibility pitch.** Plus engineering surfaced several **real bugs** (not just
polish), and the test suite covers everything *except* the money math.

---

## Where all three reviews agree (do these first — highest confidence)

1. **Auto-flow itinerary costs into Split.** Costs you enter while planning don't
   appear in Split until you find and press "Move Itinerary to Splitwise", and
   **auto-arrange creates no expenses at all** on a fresh trip (the gate is
   `itineraryPushed`, `store/index.js:851` & `:206`). The two best features —
   planning and the moat — don't compose. *(Eng P0, Design P0, QA P0/Flow 6.)*

2. **The app's own accessibility is thin despite being the wedge.** No
   `accessibilityLabel`/`role` on icon-only controls, several sub-44pt tap
   targets (incl. the 38×24 map pins → that's why pin taps "feel unreliable"),
   borderline contrast on small `subtle`-on-`surface2` text, and
   `allowFontScaling={false}` on Discover chips defeating Dynamic Type.
   *(Design P0, Eng/QA corroborate via the pin hit-target + ANR.)*

3. **Discover does too much and costs too many taps** — redesign it
   (full proposal below). *(All three.)*

4. **Stability/ANR root cause is the no-selector store pattern.** ~23–24
   components do `const { … } = useStore()` with no selector, so any state write
   re-renders the whole subtree; combined with heavy screens
   (`ItineraryScreen` runs `validateTrip` per render) and the Leaflet WebView,
   that's the likely "Expo isn't responding." *(Eng P0, QA Flow 7.)*

---

## Engineering — concrete bugs & tech debt (read-only review)

**Real bugs (P0):**
- **Duplicate `markActivityStatus` action** — defined twice in the store
  (`store/index.js:258` and `:767`); the first is silently dead. Landmine.
- **`effectiveMember` violates its own invariant** — `helpers.js:147` returns
  `tv?.dietary || []` and ignores trip-level `_dietary`/`_pace` overrides the
  docstring promises, so members with no linked traveler always get empty
  dietary → `FamilyProfileAgent` undercounts vegetarians and warnings silently
  miss. (AGENTS.md invariant #6 — the helper itself is the leak.)
- **Dangling `paidBy` still unfixed** — `deleteTraveler` (`:377`) and
  `deleteFamily` (`:393`) never reassign `paidBy`; a deleted payer orphans the
  credit and **balances stop netting to zero**.
- **`pushItineraryToSplitwise` vs `SplitwiseScreen` predicate mismatch** —
  store keeps `e.source !== 'itinerary'` (`:548`) but the screen shows only
  `e.source === 'manual'` (`SplitwiseScreen.js:35`); `source: undefined`
  expenses (seed/legacy) vanish from the UI while still counted in the total.
- **`costMode: 'per_family'` mis-bills** — saved as
  `costPerPerson = cost / avgFamilySize` then re-multiplied by each family's
  *actual* member count, so a "$100/family" cost doesn't charge each family $100
  (larger families overpay). `costMode` is display-only; all math runs through
  `costPerPerson`.

**Tech debt (P1):**
- `DiscoverModal.js` (~1,160 lines) and `ItineraryScreen.js` (~1,860 lines) need
  splitting; none of the heavy cards are memoized.
- `activityToExpense` logic triplicated in the store (`:10`, `:243`, `:547`).
- `FamilyBudgetAgent.js:78` reverse-engineers room rate from `costPerPerson` —
  fragile; pass the rate explicitly through the pipeline.
- Two parallel planning engines (`plannerAPI.js` vs the agents) duplicate cost
  constants (`HOTEL_RATE` in both) → budget tiers can drift.

---

## Design — whole-app + the Discover redesign

**Whole-app P0/P1:**
- P0: auto-flow costs into Split (#1 above); a11y labels + 44pt targets.
- P1: real loading **skeletons** + a **Retry** on Discover errors (today
  `fetchPlaces` returns `[]` on failure, so network-error looks identical to
  no-results); pre-select the only enabled plan mode and reframe the two "Soon"
  modes (a new user's final create action is a 2/3-disabled list); make the
  wizard Profile step conditional (AI trips only).
- P2: collapse the family layer for single-family trips; unify the three
  interaction models on `ActivityCard` (tap-to-expand / swipe-for-actions /
  arrows-to-reorder) and add undo to reorder.

### Discover redesign — recommended: "Shortlist-first single screen"

**Core job:** *fill my days fast.* Today adding each place is tap + → sheet →
day → slot → confirm (**4–5 taps**), repeated per place, and auto-arrange
bypasses the moat.

**The change:**
- **One add model = 1-tap shortlist.** Tapping a card (or its +) adds to a
  persistent shortlist instantly (haptic + count). Kill the per-place day/slot
  sheet from the main flow; keep it behind a rare "⋯ specific day" affordance.
  (Removes the today's confusing dual "+" that means "add" in normal mode but
  "toggle basket" in select mode.)
- **Auto-arrange becomes the default "Plan my days →" CTA** — and it **must
  create expenses** (fix `applyArrangedActivities`, respecting frozen
  `estimatedAmount`, per-person `costPerPerson`, all families participating).
- **Map becomes a lens** on the same results (bigger ≥44pt pins; tapping a pin
  adds to the shortlist, not just highlights). Hotel nightly-rate capture moves
  out of the add path into the arrange-preview/expense edit.

**Tap-count impact (plan a 6-place day):** ~24–30 taps → **~9 taps**, *with*
expenses included — roughly a **3× cut** plus it fixes the moat-bypass, mostly by
reorganizing existing pieces and fixing one store function.

Alternatives considered: (2) split Browse vs a drag-drop day-board — cleaner but
heavy to build and duplicates the itinerary; (3) map-first mindtrip-style —
optimizes the *secondary* job and leans on the least-reliable WebView code.
**Direction 1 wins** on value-per-effort.

---

## QA — coverage gaps & test plan

**Coverage today:** one file — `autoArrange.test.js` (9 good tests). **Zero tests
on the money engine** (`costs.js`, `FamilyBudgetAgent`) — the product's core and
the cheapest, highest-value tests to add.

**Suggested first PR (P0, runs in ms via `npm test`):**
- `src/utils/__tests__/costs.test.js` — net-to-zero invariant; By-Person vs
  By-Group; `participatingFamilies`/`participatingMembers` narrowing; excluded &
  zero-cost; uneven/custom + family-head share; the **dangling-paidBy** case as
  the executable spec for the store fix; the 0.5 epsilon edge.
- `src/agents/__tests__/FamilyBudgetAgent.test.js` — per-family expenses;
  `estimatedAmount` frozen; per-person math; accommodation splits by rooms;
  12% buffer; divide-by-zero guards.

**Then:** `helpers.test.js` (effectiveMember — would have caught the bug above),
`FamilyProfileAgent.test.js`, extend `autoArrange.test.js` (asserts it creates no
expenses), and `tripValidator`/`slots`.

**E2E flows to script** (adb-driven, replayable): create→plan→push→split happy
path; edit-cost re-sync; **delete member with dangling paidBy** (bug repro);
delete family rebalance; split-mode/exclusion toggles; auto-arrange preview→apply;
fast-navigation ANR.

**Testability blockers:** export `activityToExpense` from the store; extract the
inline per-family cost rollups from `ItineraryScreen` (`:811`, `:819`, `:966`)
into pure helpers; introduce `useStore` selectors so components can render in
isolation.

---

## Recommended sequence

1. **Pin the money math** — add `costs.test.js` + `FamilyBudgetAgent.test.js`
   (also encodes the dangling-paidBy spec). Cheap, fast, protects the moat.
2. **Fix the P0 bugs** — dangling paidBy on delete; `effectiveMember` overrides;
   duplicate `markActivityStatus`; the manual↔itinerary predicate mismatch;
   decide the `costMode:'per_family'` behavior and test it.
3. **Auto-flow costs into Split** + make auto-arrange create expenses — the
   single biggest product win; unblocks the Discover redesign.
4. **Discover redesign (Direction 1)** — shortlist-first, 1-tap add,
   "Plan my days" as default.
5. **Accessibility pass** — labels + 44pt targets + contrast + Dynamic Type.
6. **Stability** — `useStore` selectors + memoize heavy cards; re-test the ANR.

---

*Voyara · tri-lens review synthesis · June 2026.*
