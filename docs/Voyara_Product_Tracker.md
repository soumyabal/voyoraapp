# VoyVibe — Product Design Tracker

> **Living document.** Updated every session. Reflects the product vision agreed on 1 Jun 2026.
> Read `AGENTS.md` → Agent Alignment section before picking up any item here.

---

## The Three Things That Matter Most

Everything below ladders up to these three outcomes for Indian white collar families doing group travel:

1. **Group intelligence at setup** — VoyVibe understands who is in the group (dietary, habits, must-dos) before planning starts
2. **Dietary awareness throughout** — vegetarian-friendly filtering, warnings on conflicts, visible at every decision point
3. **WhatsApp-first output** — the organiser shares the plan to WhatsApp; other families consume it without needing the app

If a feature doesn't serve at least one of these three outcomes, deprioritise it.

---

## Status Key

| Symbol | Meaning |
|--------|---------|
| ✅ | Done and working |
| ⚠️ | Done — has known UI issues (see Issues Log) |
| 🔨 | In progress |
| 📋 | Planned — design agreed, not yet built |
| 💬 | Discussed — needs design decision before building |
| ❌ | Explicitly deferred |

---

## Feature Tracker

### 🎯 Group Intelligence Layer

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ⚠️ | **Group Profile step in New Trip wizard** | Step 3 of 4: per-family dietary chips, wake time selector, group must-dos text field | UI issues in issues log below |
| ✅ | **Group Profile edit from Trip Settings** | Per-family dietary chips + wake time selector inline in TravelersScreen family cards | Uses existing `updateFamily(tripId, famId, updates)` store action |
| ✅ | **Group compatibility summary card** | Compact dismissible strip in ItineraryScreen between day nav and day header. Shows dietary per family (colour-coded), late/early starters, must-dos. Disappears if no data. | `groupProfileDismissed` state — reappears next session |
| ✅ | **Wake time awareness in Trip Check** | Rule 8 in `validateDay`: flags non-transport activities before 9am (late) or 7am (regular) for matching families. `families[]` now passed into `validateDay`. | |
| ✅ | **Must-dos surfaced in planning** | Dedicated amber strip in `ItineraryScreen` below the group card. Parses `trip.mustDos` by newline/comma into tappable chips. Tap to check off (strikethrough + green); "🎉 All must-dos added!" when all done. "✕ Hide" dismisses. Separate `mustDosDismissed` / `mustDosChecked` state from group card. | `mustDoStrip` styles in `ItineraryScreen.js` |

---

### 🥦 Dietary Awareness

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ✅ | **Dietary-aware Discover queries** | Food/cafe searches add "vegetarian friendly" bias when group has veg/vegan families | Lives in `DiscoverModal.js` → `getDietaryBias()` |
| ✅ | **Dietary badge in Discover header** | Shows "🥦 Veg · 🍺 No Alcohol · filtered" under the title when group has dietary needs | |
| ✅ | **Dietary warning on food activity cards** | Yellow ⚠️ chip when food activity name contains meat/alcohol keywords AND group has veg/no-alcohol families | `getDietaryWarning()` in `ItineraryScreen.js`. Keyword-based, conservative — no false positives on generic names. |
| ✅ | **Vegetarian chip on PlaceCard in Discover** | Shows "🥦 Veg friendly" badge on place cards when name or type signals veg-friendly (veggie keywords in name, or cafe/bakery/juice bar/etc types) | `isVegFriendly` computed in `fetchPlaces()`; badge rendered in `PlaceCard` |
| ✅ | **Dietary filter chips in Discover** | Horizontal chip row in Discover modal — 🥦 Veg, 🌱 Vegan, 🍺 No Alcohol, 🌾 GF. Auto-seeded from group dietary profile on open; re-queries on toggle | `FILTER_OPTS` chips in `DiscoverModal.js`; `getFilterBias()` appends to Places query |

---

### 📲 WhatsApp-First Output

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ✅ | **WhatsApp day plan share** | 📤 button in sticky bar → native share sheet with clean day summary (slots, times, costs, VoyVibe attribution) | Built 1 Jun 2026 — `generateDayShareText()` in `ItineraryScreen.js` |
| ✅ | **PDF export** | Full trip export via `expo-print` + `expo-sharing` | Already built, accessible from trip ⋮ menu |
| ✅ | **Per-day PDF export** | Compact single-day PDF — families + dietary, activities by slot, day cost summary | `exportDayAsPDF()` in `exportPlan.js`. Triggered from ⓘ detail sheet. |

---

### ♿ Accessibility & Needs Awareness

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| 📋 | **Accessibility warning on activity cards** | ⚠️ badge when a traveler in the trip has a `needs` tag that conflicts with an activity (e.g. wheelchair user + activity with no accessibility flag) | Data exists on traveler profiles — not surfaced during planning |
| 📋 | **Needs tags display on family in Discover** | Show family needs in Discover modal header so organiser remembers constraints while searching | Lightweight reminder |

---

### 💰 Budget Transparency

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ✅ | **Sticky header — trip total + day cost** | Always-visible bar showing trip total and active day cost | Live in `ItineraryScreen.js` → `StickyHeader` |
| ✅ | **Family totals in detail sheet** | Tap ⓘ to see each family's total | Lives in slide-up sheet |
| 📋 | **Real-time family day cost while adding** | Show "Day 3 so far: Sharma ₹4,200 · Patel ₹3,800" as activities are added — in the day header or sticky bar | Data is computable — not shown at add-time |
| 📋 | **Budget comfort indicator** | Visual signal when a day's cost exceeds a family's rough comfort level (from Group Profile budget field — not yet captured) | Would need a budget preference field in Group Profile |

---

### 🗺️ Planning Flow Improvements

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ✅ | **Discover modal** | Google Places search, category chips, tap-to-add at time slots | Accessible via 🔍 Discover button in day header |
| ✅ | **Activity duration on cards** | Shows estimated duration (e.g. `~2h`) below type icon | |
| ✅ | **Arrival time on transport cards** | DEPARTS/ARRIVES fields; card shows `→12:00 local` | |
| ✅ | **Address + Google Maps link** | Manual activities can have an address that opens Maps on tap | |
| ✅ | **Discover button more prominent** | Promoted to a floating action button (bottom-left, mirroring Check Trip FAB at bottom-right). Removed the small header outline button. | `discoverFab` style in `ItineraryScreen.js` |
| ✅ | **Schedule-aware activity suggestions** | Morning slot button dimmed (opacity + dashed border + 🦉) in `PlaceCard` when any family has `wakeTime: 'late'`. A yellow hint strip appears above results. | `lateStartGroup` computed in `DiscoverModal`, passed to `PlaceCard` |
| ✅ | **Auto-arrange a basket of Discover events** | Opt-in "+ Build a day" mode in Discover: multi-select places, then a rule-based engine spreads them across days/times. Editable preview (move to day, multi-day span for big venues, remove, re-arrange) before Apply. Merges *around* existing activities — never overwrites. Overflow that doesn't fit is surfaced, not dropped. | `src/utils/autoArrange.js` — pure engine (city clustering, nearest-neighbour routing, meal-first time packing, pin-to-day / multi-day hints), 9 jest tests. `applyArrangedActivities` store action. Basket + preview UI in `DiscoverModal.js`. Verified live on Android emulator. |

---

### 🛠️ Trip Check (Validation)

| Status | Feature | What it does | Notes |
|--------|---------|--------------|-------|
| ✅ | **Overlap detection + direct fix** | "Move X to HH:MM" action button on overlap warnings | |
| ✅ | **Multi-day journey overlap hints** | Suggests Day N for journeys that cross midnight/timezone | |
| ✅ | **Severity filter chips** | Tap 🔴/🟠/🔵 to filter to that severity | |
| ✅ | **Jump to Day navigation fixed** | Each warning card has explicit "Jump to Day X →" button | |
| ✅ | **Wake time rule** | Rule 8 in `validateDay`: flags non-transport activities before 9am for `late` families, before 7am for `regular`. `early` families get no warning. | Already built — tracker was out of sync with Group Intelligence Layer entry |
| ✅ | **Dietary conflict rule** | Rule 9 in `validateDay`: flags food activities whose name/detail contains meat or alcohol keywords when the group has veg/vegan/no-alcohol families. Severity: warning, icon 🥦 | `MEAT_RE` + `ALCO_RE` keyword patterns; uses `families[]` already passed into `validateDay` |

---

## 🐛 Known UI Issues Log

*Report issues here with enough detail to fix them without re-testing.*

| # | Where | Issue | Priority |
|---|-------|-------|----------|
| 1 | NewTripModal — Step indicator | 4-step indicator may look crowded on small phones (SE, Mini) — the step labels may truncate | Medium |
| 2 | NewTripModal — Step 3 | Dietary chips may overflow or wrap awkwardly on narrow screens | Medium |
| 3 | NewTripModal — Step 3 | When no families have been added (Step 2 was skipped), Step 3 shows empty state — "Skip for now" label in footer should change to "Continue →" in this case | Low |
| 4 | NewTripModal — Step 3 | Wake time selector buttons may be too narrow on small screens — hint text ("8–10am") may be cut off | Medium |

| 5 | DiscoverModal — dietary filter chips row | ~~Filter chip row clipped / overlapping results~~ — **Fixed**: `filterRow`, `filterRowContent`, `filterChip` styles were missing from `s` StyleSheet entirely (silent RN no-ops). Added all missing styles with `maxHeight: 40` and proper `paddingHorizontal`. | ~~Medium~~ ✅ |

*Add new issues here as they're found. Do not fix inline — log first so we can batch.*

---

## ❌ Explicitly Deferred

These are good ideas but are not being built until the Phase 2 backend exists or a clear trigger emerges.

| Feature | Why deferred |
|---------|-------------|
| Multi-family activity voting / pending states | Requires backend + push notifications — thin version without infrastructure feels broken |
| Real-time group coordination ("running late" broadcast) | Same reason — needs backend |
| Transit gap detection between activities | Lower priority than dietary/accessibility; any app can do drive times |
| Full shareable live link (not just PDF) | Requires backend for hosting |
| Per-day PDF with WhatsApp share | Do WhatsApp text share first (simpler, higher impact), then PDF per-day |

---

## Session History — What Changed When

| Session | Date | Changes |
|---------|------|---------|
| Product design vision | 1 Jun 2026 | Defined target audience (Indian white collar families), GTM strategy, three core features, updated AGENTS.md |
| Group Profile step | 1 Jun 2026 | Built Step 3 in NewTripModal — per-family dietary + wake time + group must-dos; dietary-aware Discover biasing |
| WhatsApp day share | 1 Jun 2026 | 📤 button in sticky bar; `generateDayShareText()` produces slot-grouped, cost-annotated, WhatsApp-readable text via native Share API |
| Per-day PDF export | 1 Jun 2026 | `exportDayAsPDF()` in `exportPlan.js`; triggered from ⓘ detail sheet; slot-grouped activities, family dietary, day cost summary |
| Dietary Awareness completion | 1 Jun 2026 | Veg friendly badge on PlaceCard (`isVegFriendly` → rendered); dietary filter chips already built (confirmed ✅); dietary conflict Rule 9 in `tripValidator.js` (meat/alcohol keyword detection vs group dietary profile) |

---

*VoyVibe · Product Design Tracker · Started 1 Jun 2026*
