# VoyVibe — AI Agent Context & System Design
> Last updated: June 2026 | Maintained by: AI session log
> **Read this first before touching any code.**

---

## 🚨 CRITICAL: Active Codebase

**`VoyVibeFresh/` is the only React Native app in this workspace.** (`VoyVibeApp/` was an older prototype scaffold — it has been deleted.)

The original web prototype lives at `travel-planner.html` — read it for business logic reference only; never edit it.

All code changes go into `C:\Users\soumy\OneDrive\Documents\Claude\Projects\Viara\VoyVibeFresh\`.

---

## Project Overview

**VoyVibe** is a multi-family travel planning app. Groups of families plan trips together — shared itinerary, per-person cost estimates, accessibility tracking, and Splitwise-style expense splitting.

**Stack:** Expo SDK (React Native) · Zustand (state) · AsyncStorage (persistence) · React Navigation

**No backend yet.** Auth, payments, and AI generation are all simulated. Data persists locally via AsyncStorage through Zustand's `persist` middleware.

---

## File Structure — VoyVibeFresh

```
VoyVibeFresh/
├── App.js                          Entry point — NavigationContainer + SafeAreaProvider
├── src/
│   ├── config.js                   Feature flags (RELEASE_FLAGS.aiPlanner etc.)
│   ├── theme.js                    Design tokens — colors, spacing, radius, typography, shadow
│   ├── store/
│   │   └── index.js                Zustand store — ALL global state + actions
│   ├── utils/
│   │   ├── helpers.js              fmt(), fmtM(), getAllMembers(), uid(), getActivityIcon()
│   │   ├── costs.js                Split math, settlement algorithm, credit estimator
│   │   ├── tripValidator.js        Duration estimation + validateTrip() → Warning[]
│   │   ├── aiAssist.js             Local rule engine (analyzeItinerary)
│   │   ├── itineraryPlanner.js     AI itinerary generation helpers
│   │   ├── plannerAPI.js           Claude API integration (streaming)
│   │   ├── plannerRules.js         Planner constraint rules
│   │   └── exportPlan.js           PDF export
│   ├── agents/                     Agentic planning pipeline
│   │   ├── pipeline.js             Orchestrates agents
│   │   ├── ItineraryAgent.js
│   │   ├── ExperienceAgent.js
│   │   ├── StayAgent.js
│   │   ├── TransitAgent.js
│   │   ├── FamilyBudgetAgent.js
│   │   └── FamilyProfileAgent.js
│   ├── screens/
│   │   ├── HomeScreen.js           Trip list + global traveler/group library tabs
│   │   ├── TripScreen.js           Trip header + tab switcher — OWNS validation modal
│   │   ├── ItineraryScreen.js      Day-by-day planner — slot-based Morning/Afternoon/Evening/Night
│   │   ├── TravelersScreen.js      Family roster + needs tags
│   │   ├── SplitwiseScreen.js      Expense splitting + settlement
│   │   └── ProfilesScreen.js       Global traveler profiles
│   ├── modals/
│   │   ├── NewTripModal.js         3-step trip creation wizard
│   │   ├── EditTripModal.js        Edit name/destination/dates (with destructive change guard)
│   │   ├── ChangeModeModal.js      Switch Manual / AI / Expert mode
│   │   ├── AddActivityModal.js     Add/edit a day activity
│   │   ├── AddExpenseModal.js      Manual Splitwise expense
│   │   ├── AddTravelerModal.js     Add member to family
│   │   ├── AddFamilyModal.js       Add new family to trip
│   │   ├── AddGroupToTripModal.js  Add a saved group to a trip
│   │   ├── AddProfileModal.js      Create/edit global traveler profile
│   │   ├── SelectTravelersModal.js Pick travelers from global library
│   │   ├── AuthModal.js            Sign up / sign in
│   │   ├── BuyCreditsModal.js      Credit pack purchase
│   │   ├── AIPlannerModal.js       AI trip planning modal
│   │   ├── AgenticPlannerModal.js  Multi-agent planning pipeline
│   │   ├── AIChatModal.js          AI chat assistant
│   │   └── TripValidationModal.js  Trip Check results — tappable cards navigate to issue
│   ├── navigation/
│   │   └── AppNavigator.js         Stack navigator (Home → Trip)
│   ├── components/
│   │   ├── Toast.js                Global toast notifications
│   │   ├── TripCard.js             Home screen trip card
│   │   └── ui/                     Shared UI kit
│   │       ├── FormField.js
│   │       ├── ModalHeader.js
│   │       ├── DateRangePicker.js
│   │       ├── ChipSelector.js
│   │       ├── Avatar.js
│   │       ├── Badge.js
│   │       ├── FamilyRow.js
│   │       ├── EmptyState.js
│   │       ├── InfoBanner.js
│   │       └── LocationSearchField.js
│   └── data/
│       └── sampleData.js           Seed data for dev/demo
```

---

## Architecture

### Screen Hierarchy

```
AppNavigator (Stack)
├── HomeScreen          ← Trip list, global traveler library, + New Trip FAB
└── TripScreen          ← Trip header + 3 tabs; OWNS validation state + modal
    ├── ItineraryScreen ← Slot-based day planner; Check Trip FAB
    ├── TravelersScreen ← Family/member roster
    └── SplitwiseScreen ← Expense splitting
```

### State Management — Zustand

Single store at `src/store/index.js`. **All mutations go through store actions — never mutate state directly.**

Key state shape:
```js
{
  trips: Trip[],            // all trips, newest first
  travelers: Traveler[],    // global traveler library (people who travel across trips)
  groups: Group[],          // reusable named collections of travelers
  currentTripId: string,    // which trip is open
  currentDay: number,       // which day tab is active in ItineraryScreen
  account: {
    loggedIn: boolean,
    name: string,
    email: string,
    aiPlannerUsed: boolean,
    aiReviewsUsed: number,
    plan: 'free' | 'explorer' | 'pro',
  },
}
```

Key store actions (partial list):
```js
getCurrentTrip()                              → Trip | null
setCurrentTrip(tripId)
setCurrentDay(dayIndex)
createTrip({ name, destination, startDate, endDate, mode, familyForms })
updateTrip(tripId, updates)                   // shallow merge — does NOT regenerate days[]
deleteTrip(tripId)
duplicateTrip(tripId)                         // deep copy, new IDs, clears expenses

addActivity(tripId, dayIndex, activity)
deleteActivity(tripId, actId)
updateActivity(tripId, actId, updates)
reorderActivity(tripId, dayIndex, actId, direction)  // swaps times between adjacent activities
moveActivity(tripId, fromDay, toDay, actId)
markActivityStatus(tripId, actId, status)     // null | 'done' | 'skipped'
pushItineraryToSplitwise(tripId)

addFamily / addTraveler / addMember
addExpense / deleteExpense / toggleFamilySplit / updateExpensePayer
```

### Data Invariants

1. **`expense.participatingFamilies[]` is always the source of truth for splitting** — never `splitBetween[]`. Always derive split via `getExpSplitBetween(exp, trip)` from `costs.js`.
2. **Activities are always sorted by `activity.time` (HH:MM) at render time.** There is no display-order field. Reordering = swapping time values between two adjacent activities.
3. **`trip.days[]` is generated once at `createTrip`** — one entry per calendar day. Changing dates does NOT regenerate days (guarded by destructive-change alert in EditTripModal).
4. **`itineraryPushed`** on Trip should be treated as a display flag — check whether any `expenses` have `source === 'itinerary'` as the real truth.

---

## Design System — `src/theme.js`

Always import from theme, never hardcode values.

```js
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
```

**Colors:**
```
primary    #e86c3a  (brand orange — CTAs, active states)
ai         #6c5ce7  (purple — AI mode)
expert     #0984e3  (blue — Expert mode)
green      #00b894  (success, money, balance)
red        #d63031  (error, debt)
yellow     #fdcb6e  (warning, cost)
bg         #f7f5f2  (app background)
surface    #ffffff  (card/modal background)
surface2   #f0ede8  (secondary surface)
border     #e4dfd8
text       #1a1714
muted      #7a7067
```

**Spacing:** xs=4, sm=8, md=12, lg=16, xl=20, xxl=24, xxxl=32

**Radius:** sm=8, md=12, lg=16, xl=24, full=999

**Activity type colors (left border):**
```
transport  #0984e3 (blue)
stay       #6c5ce7 (purple)
food       #e17055 (salmon)
activity   #00b894 (green)
note       #fdcb6e (yellow)
```

---

## Feature Catalog

### Itinerary Screen — Slot-Based Layout

Activities are grouped into 4 time slots:
- 🌅 Morning (before noon, default 09:00)
- ☀️ Afternoon (12–5pm, default 13:00)
- 🌆 Evening (5–9pm, default 18:00)
- 🌙 Night (after 9pm, default 21:00)

Each slot shows a "+ Add" button. Tapping an activity opens `AddActivityModal` in edit mode.

**Reorder within slot:** ↑↓ arrows swap `activity.time` values between adjacent activities in the same slot. This keeps time-based sort consistent — no separate display order field needed.

**Move to different slot/day:** Long-press → Alert → pick destination slot (changes `activity.time`) or use 📅 button to move to a different day.

**Activity status:** Checkbox cycles `null → 'done' → 'skipped'`. Done/skipped activities are dimmed and excluded from overlap detection.

### Trip Validation — `src/utils/tripValidator.js`

Entry point: `validateTrip(trip)` → `Warning[]`

Each warning: `{ type, severity, icon, title, message, hint, dayIndex?, actIds? }`

Severities: `'error'` (red) | `'warning'` (amber) | `'info'` (blue)

**Duration estimation — `estimateDuration(activity)`:**
Matches `activity.name + detail` against 30+ keyword patterns (museums 2–4h, theme parks 6–8h, dinner 1.5–2.5h, airport 2.5–3.5h…). Falls back to `activity.type` default if no keyword matches. Returns `{ min, max }` in minutes.

**Validation rules:**
| Rule | Severity | Trigger |
|---|---|---|
| Schedule overlap | error/warning | `endMin > nextStart` |
| Full-day venue conflict | warning | Theme park + 2+ other major activities |
| Very packed day | warning | 8+ activities |
| No meal on long day | info | No food, 3+ activities, 4h+ span |
| Past-midnight end | info | Last activity ends after midnight |
| Very early start | info | Non-transport activity before 06:00 |
| Empty day (middle) | info | Day between active days has no activities |

**Helper functions also exported:**
- `groupWarningsByDay(warnings, trip)` → `{ [dayIndex]: Warning[] }`
- `summariseWarnings(warnings)` → `{ errors, warnings, infos }`
- `estimateDuration(activity)` → `{ min, max }` (minutes)

### Trip Check UI Flow

```
User taps "✅ Check Trip" FAB (ItineraryScreen, bottom-right)
  ↓
TripValidationModal opens (owned by TripScreen, passed via onCheckTrip prop)
  ↓
User taps a warning card
  ↓
handleNavigate(warning) fires:
  1. onNavigate(warning) called → handleValidationNavigate in TripScreen
  2. onClose() → modal dismisses
  3. setActiveTab('itinerary')          ← switches to itinerary tab
  4. setCurrentDay(warning.dayIndex)    ← jumps to relevant day
  5. setHighlightedActIds(warning.actIds) ← passed as prop to ItineraryScreen
  6. setTimeout 3s → clears highlight
  ↓
ActivityCard with matching ID renders with orange border + primaryLight background
```

**Prop chain:**
```
TripScreen
  showValidation state          ← opened by onCheckTrip callback
  highlightedActIds state       ← set by handleValidationNavigate
  handleValidationNavigate()    ← onNavigate handler passed to modal
    ↓ props
  ItineraryScreen
    onCheckTrip={() => setShowValidation(true)}
    highlightedActIds={highlightedActIds}
      ↓ props
    ActivityCard
      isHighlighted={highlightedActIds.includes(act.id)}
```

### FAB Pattern

Floating action buttons match the Home screen's "+ New Trip" FAB style:
```js
{
  position: 'absolute',
  right: 20,
  bottom: 24,
  borderRadius: radius.full,
  paddingHorizontal: 20,
  paddingVertical: 14,
  // shadow.lg equivalent
}
```
The Check Trip FAB uses dynamic `backgroundColor` based on issue severity (green/orange/red).

### Splitwise Flow

Key invariant: `participatingFamilies[]` drives all math.

Settlement uses a greedy algorithm: sort members by net balance → pair largest creditor with largest debtor → emit transfer → repeat.

---

## Known Gotchas & Lessons Learned

### 1. VoyVibeFresh is the only app — VoyVibeApp is deleted
`VoyVibeApp/` was an older prototype scaffold that has been deleted. `VoyVibeFresh/` is the only React Native project. Tab labels are "Plan / People / Split".

### 2. ItineraryScreen has TWO StyleSheets — both were truncated
`ItineraryScreen.js` has two separate `StyleSheet.create` objects:
- **`const ch`** — used by `StickyHeader` and `TripExpenseChart` (the dark sticky bar, slide-up detail sheet, bar chart)
- **`const styles`** — used by the main `ItineraryScreen` component and `ActivityCard`

Both were previously truncated mid-file (original file ended at `paddingHo`). This caused a runtime crash: **"Property 'ch' doesn't exist"** because `ch` was not defined at all. Repaired in June 2026 by reconstructing both StyleSheets.

**If this error recurs:** Check that both `const ch = StyleSheet.create({...})` and `const styles = StyleSheet.create({...})` exist in the file and each closes with `});`. Run this to verify:
```bash
python3 -c "
import re; content = open('src/screens/ItineraryScreen.js').read()
print('ch defined:', 'const ch = StyleSheet' in content)
print('styles defined:', 'const styles = StyleSheet' in content)
refs = set(re.findall(r'\bch\.([a-zA-Z]+)', content))
defined = set(re.findall(r'\n  ([a-zA-Z]+):', content[content.find('const ch'):content.find('const ch')+6000]))
print('Missing ch keys:', refs - defined or 'NONE')
"
```

### 3. Activity reorder = time swap
There is no display-order field. Reordering uses `reorderActivity(tripId, dayIndex, actId, direction)` in the store, which swaps the `time` values between adjacent activities. The UI then re-sorts by time and the order changes naturally.

### 4. updateTrip does not regenerate days[]
`updateTrip(tripId, { startDate, endDate })` does a shallow merge — it will NOT add or remove day objects. If dates change, `trip.days[]` goes stale. EditTripModal has a destructive-change guard (Alert + duplicate suggestion) to handle this.

### 5. Check Trip button placement
History:
- v1.0: "✓ Check" pill in the day header next to "+ Activity" — confusing, looked like "mark day complete"
- v1.1: Moved to TripScreen header between ← Back and ⋮ — cleaner but removed after user feedback
- v1.2 (current): FAB on ItineraryScreen (bottom-right, styled like "+ New Trip"). TripScreen owns the validation state and modal; ItineraryScreen receives `onCheckTrip` callback and `highlightedActIds` as props.

### 6. Slot-based vs time-based rendering
ItineraryScreen groups activities into Morning/Afternoon/Evening/Night slots using `getSlotKey(time)`. Activities within each slot are sorted by time. The `DAY_SLOTS` constant defines the ranges.

### 7. StickyHeader + ScrollView structure
ItineraryScreen has a `StickyHeader` component (trip total + day cost bar) that sits above the `ScrollView` and never scrolls away. The `ScrollView` contains the day navigation tabs and slot sections.

### 8. All tabs stay mounted
TripScreen uses `display: 'flex' / 'none'` (not conditional rendering) to keep all tab screens mounted. This preserves scroll position when switching tabs.

---

## How to Add a New Feature — Checklist

1. **Read the store first.** Check `store/index.js` for existing actions before adding new ones.
2. **Check theme.js** for the right color/spacing tokens — never hardcode.
3. **State that lives across tabs** (e.g., validation, highlights) → put in `TripScreen`, pass down as props.
4. **State that's purely local to a screen** → `useState` in that screen.
5. **New store action:** Add to the `persist` block in `store/index.js`. Follow the pattern of updating `trips` immutably with `.map()`.
6. **New modal:** Create in `src/modals/`, import in the screen that owns it.
7. **FAB:** Use `position: 'absolute', right: 20, bottom: 24, borderRadius: radius.full` pattern from HomeScreen.
8. **After adding styles:** Verify the `StyleSheet.create({...})` block closes with `});` — the file was previously truncated.
9. **Update this document** with what was added.

---

## Version History (AI Session Changelog)

### v1.0 — May 2026
Initial web SPA (`travel-planner.html`) — vanilla JS, single-file, in-memory state.

### v1.1 — May 2026
React Native rebuild (`VoyVibeApp/`) — Expo, Zustand, React Navigation, AsyncStorage.

### v1.2 — June 2026 (VoyVibeFresh — AI session)

**Identified correct codebase:** Discovered `VoyVibeFresh/` is the active app, not `VoyVibeApp/`. All subsequent changes applied to `VoyVibeFresh/`.

**Activity Reordering:**
- Store action: `reorderActivity(tripId, dayIndex, actId, direction)` — swaps time values between adjacent activities
- UI: ↑↓ arrow buttons on each ActivityCard (already existed in VoyVibeFresh)
- Post-reorder hint bar: brief banner pointing user to Check Trip

**Trip Validation Engine — `src/utils/tripValidator.js`:**
- `estimateDuration(activity)`: 30+ keyword rules (museums 2–4h, theme parks 6–8h, etc.)
- `validateTrip(trip)` → Warning[] with severity, dayIndex, actIds
- Rules: overlaps, full-day conflicts, packed days, missing meals, past-midnight, early starts, empty middle days
- Helpers: `groupWarningsByDay`, `summariseWarnings`

**TripValidationModal — `src/modals/TripValidationModal.js`:**
- Grouped by day, colour-coded by severity
- Each warning card is now a `TouchableOpacity` with `"Go to Day X →"` / `"Jump to Day X →"` nav footer
- `onNavigate(warning)` prop + `onClose()` called on tap

**Trip Check FAB (ItineraryScreen):**
- Floating button styled like HomeScreen's "+ New Trip" FAB
- Dynamic color: ✅ green (clean) / ⚠️ orange (warnings) / 🚫 red (errors) with issue count badge
- Renders via `onCheckTrip` prop passed from TripScreen

**Navigation from validation to activity:**
- TripScreen: `handleValidationNavigate(warning)` → switches tab, sets day, highlights actIds for 3s
- ItineraryScreen: accepts `highlightedActIds` prop → `isHighlighted` on ActivityCard → orange border + primaryLight bg
- Prop chain: TripScreen → ItineraryScreen → ActivityCard

**StyleSheet repair (two rounds):**
- `ItineraryScreen.js` was truncated mid-file (ended at `paddingHo` inside `slotHeader`)
- Round 1: restored `const styles` — ActivityCard styles (actCard, actCardNote, actCardDone, slot styles, day picker, etc.) and added `actCardHighlighted`
- Round 2: discovered `const ch` (used by `StickyHeader` + `TripExpenseChart`) was also missing entirely → runtime crash "Property 'ch' doesn't exist" → restored all 39 ch keys (stickyBar, miniTripAmt, overlay, sheet, bar chart styles, etc.)

**UX iteration on Check Trip placement:**
- Started: day header pill "✓ Check" (confusing — looked like task completion)
- Moved to: TripScreen header between ← Back and ⋮
- Final: removed from header entirely, kept only as FAB on ItineraryScreen

---

## What to Do Next (Backlog)

The following items have been discussed or partially designed but not yet built:

- **Real auth & backend** — Currently simulated. Recommended: Supabase Auth + Firestore
- **AI chat assistant** — `AIChatModal.js` exists; Claude API integration in `plannerAPI.js`
- **Subscription tiers** — Free / Explorer ($4.99/mo) / Family Pro ($9.99/mo) — designed but not implemented
- **Traveler profile system** — `store.travelers[]` and `store.groups[]` exist; link member → profile on trip creation
- **Conflict auto-fix** — When user taps "Jump to Day X" from a validation overlap card, offer a one-tap "Shift [activity] to [suggested time]" action
- **Edit trip dates → regenerate days** — Currently guarded with a destructive-change alert; ideal fix is "Regenerate days (keep activities that fit)"
- **Expense payer cleanup** — Deleting a member leaves dangling `paidBy` IDs; on `deleteMember`, reassign `paidBy` to first remaining family member
