# ✈️ VoyVibe — Developer Guide

> Family Group Travel Planner · React Native · Expo Go  
> Last updated: June 2026 · Phase 1 complete · Manual-planning focus

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Development Workflow](#3-development-workflow)
4. [Project Structure](#4-project-structure)
5. [State Management (Zustand)](#5-state-management-zustand)
6. [Multi-Agent Architecture](#6-multi-agent-architecture)
7. [Expense Splitting Logic](#7-expense-splitting-logic-costsjs)
8. [Theme & Design Tokens](#8-theme--design-tokens)
9. [Key Features Built](#9-key-features-built)
10. [Common Issues & Fixes](#10-common-issues--fixes)
11. [Claude + Developer Collaboration Model](#11-claude--developer-collaboration-model)
12. [Product Vision — Manual Planning Focus](#12-product-vision--manual-planning-focus)

---

## 1. Project Overview

VoyVibe is a React Native mobile app for planning multi-family group trips. It covers itinerary building, traveler management, and expense splitting across families using an insurance-style or individual cost model.

| Property | Value |
|---|---|
| App name | VoyVibe (internal codename: VoyVibeFresh) |
| Platform | iOS (Expo Go), Android compatible |
| Framework | React Native (Expo managed workflow) |
| Expo SDK | 54 |
| State | Zustand + AsyncStorage (persisted) |
| Navigation | React Navigation (stack) |
| Repo root | `VoyVibeFresh/` |

---

## 2. Tech Stack

### 2.1 Core Dependencies

| Package | Version / Notes | Purpose |
|---|---|---|
| `react-native` | via Expo 54 | Core framework |
| `expo` | SDK 54 | Managed workflow, OTA updates |
| `zustand` | latest | Global state management |
| `@react-native-async-storage/async-storage` | via Expo | Persisted store |
| `react-navigation` | v6 | Screen navigation |
| `react-native-safe-area-context` | via Expo | Safe area insets |
| `expo-linear-gradient` | via Expo | Gradient UI accents |

### 2.2 No SVG Policy

The project deliberately avoids `react-native-svg` and other heavy native modules to stay compatible with Expo Go without ejecting. All charts are built using plain React Native Views with transforms and absolute positioning.

---

## 3. Development Workflow

This project uses a split-responsibility model: **Claude (via Cowork) owns code changes**, and the **developer owns the running dev server and device testing**.

### 3.1 How Claude Makes Changes

- Claude has direct read/write access to the project files in the workspace folder.
- Claude edits JavaScript files (screens, modals, store, utils, theme) using file tools — no terminal required on Claude's side.
- Claude **cannot** start the Expo dev server, trigger hot reload, or run npm/expo commands — that stays in VS Code.
- After Claude finishes a batch of changes, the developer saves any open files and the Expo server auto-reloads.

### 3.2 Developer Responsibilities

- Run the Expo dev server from VS Code terminal.
- Keep Expo Go open on the iPhone.
- Run `git add / commit / push` after reviewing Claude's changes.
- Handle any native module issues or EAS builds if needed in the future.

### 3.3 Starting the Dev Server

Open VS Code, open a terminal in the `VoyVibeFresh/` folder, and run:

```bash
cd VoyVibeFresh
npx expo start
```

Then scan the QR code with the **Expo Go** app on iPhone. The app will hot-reload whenever Claude saves a file or you save manually.

### 3.4 Testing on iPhone (Expo Go)

- Install **Expo Go** from the App Store.
- Ensure iPhone and dev machine are on the **same Wi-Fi network**.
- Scan the QR code shown in the terminal after running `npx expo start`.
- Shake the phone or press `Cmd+D` in simulator to open the developer menu (reload, inspect, etc.).

### 3.5 Git Workflow

After Claude finishes a feature, commit and push from VS Code terminal:

```bash
git add -A
git commit -m "feat: <description>"
git push
```

If you see a stale `index.lock` error (can happen across the Windows/WSL boundary):

```powershell
# Run in Windows terminal / PowerShell
del .git\index.lock
```

---

## 4. Project Structure

```
VoyVibeFresh/
├── AGENTS.md             # AI agent quick-start guide (read this first)
├── CLAUDE.md             # Redirects to AGENTS.md
├── src/
│   ├── agents/           # Multi-agent pipeline (Phase 1)
│   │   ├── pipeline.js         Orchestrator
│   │   ├── FamilyProfileAgent.js
│   │   ├── StayAgent.js
│   │   ├── ExperienceAgent.js
│   │   ├── TransitAgent.js
│   │   ├── FamilyBudgetAgent.js  ← VoyVibe moat
│   │   └── ItineraryAgent.js
│   ├── screens/          # Full-page screen components
│   ├── modals/           # Modal overlays
│   ├── components/       # Shared UI primitives (ui/)
│   ├── store/            # Zustand store (index.js)
│   ├── utils/            # plannerAPI.js, aiAssist.js, helpers.js, costs.js
│   ├── data/             # sampleData.js (seed trips)
│   └── theme.js          # Colors, spacing, typography
├── App.js                # Navigation root
└── app.json              # Expo config
```

### 4.1 Key Screens

| File | Purpose |
|---|---|
| `screens/HomeScreen.js` | Trip list, create-trip entry point |
| `screens/TripScreen.js` | Tab shell (Itinerary / Travelers / Splitwise) + ⋮ menu |
| `screens/ItineraryScreen.js` | Day-by-day activity planner + expense bar chart |
| `screens/TravelersScreen.js` | Family & member roster |
| `screens/SplitwiseScreen.js` | Expense splitting with family/individual modes |

### 4.2 Key Modals

| File | Purpose |
|---|---|
| `modals/NewTripModal.js` | 3-step wizard: mode → details+dates → travelers |
| `modals/EditTripModal.js` | Edit trip name, destination, dates |
| `modals/AddActivityModal.js` | Add itinerary activity to a specific day |
| `modals/AddExpenseModal.js` | Log a real expense with payer + participant selection |
| `components/ui/DateRangePicker.js` | Custom 2-month calendar for start/end date selection |

---

## 5. State Management (Zustand)

All state lives in `src/store/index.js`. The store is persisted to AsyncStorage under the key `voyvibe-storage`. On first load, it seeds from `sampleData.js` so the app has demo trips.

### 5.1 State Shape

```js
{
  trips: Trip[],          // All trips
  currentTripId: string,  // Active trip
  currentDay: number,     // Active day index in ItineraryScreen
  planMode: string|null,  // New trip mode selection
  account: { loggedIn, name, email, credits, history }
}
```

### 5.2 Trip Shape

```js
{
  id, name, destination, emoji, startDate, endDate,
  mode,           // "ai" | "expert" | "manual"
  splitMode,      // "individual" | "family"
  bgColors,       // gradient pair for card
  itineraryPushed: boolean,
  families: Family[],
  days: Day[],
  expenses: Expense[],
}
```

### 5.3 Family Shape

```js
{
  id, name, color,
  members: [{ id, name, age, needs: [] }]
}
```

### 5.4 Expense Shape

```js
{
  id, name, amount,
  estimatedAmount,          // immutable reference (itinerary-sourced expenses only)
  category,                 // emoji string
  paidBy,                   // member id
  splitMode,                // null (inherit) | "individual" | "family"
  participatingFamilies,    // [famId, ...] | null (all)
  participatingMembers,     // [memberId, ...] | null (all in participating families)
  excluded,                 // boolean — soft-hide from calculations
  source,                   // "itinerary" | undefined (manual)
}
```

### 5.5 New Fields (added in Phase 1)

```js
// Trip now also has:
{
  budgetByFamily:  FamilyBudget[],  // per-family cost breakdown from FamilyBudgetAgent
  agentMeta:       object | null,   // { agentsRun, durationMs, hotelUsed, topExperiences, ... }
}

// Expense now also has:
{
  familyId: string | null,   // set by FamilyBudgetAgent — links expense to one family
}
```

### 5.6 Key Store Actions

| Action | What it does |
|---|---|
| `createTrip({ name, destination, startDate, endDate, mode, familyForms })` | Builds full trip with days, families, members; prepends to `trips[]` |
| `updateTrip(tripId, updates)` | Shallow-merges updates into the matching trip |
| `deleteTrip(tripId)` | Removes trip; clears `currentTripId` if it was active |
| `duplicateTrip(tripId)` | Deep-clones trip with fresh UIDs; clears expenses and resets `itineraryPushed` |
| `pushItineraryToSplitwise(tripId)` | Converts costed activities into Expense objects with `estimatedAmount` frozen |
| `setTripSplitMode(tripId, mode)` | Sets trip-level split mode (`"individual"` \| `"family"`) |
| `updateExpenseSplitMode(tripId, expId, mode)` | Per-expense mode override |
| `toggleFamilySplit(tripId, expId, famId, checked)` | Add/remove a family from `participatingFamilies` |
| `toggleExpenseMember(tripId, expId, memberId, included)` | Add/remove a member from `participatingMembers` |
| `toggleExpenseExcluded(tripId, expId)` | Soft-hide expense from all calculations |
| `updateExpenseAmount(tripId, expId, amount)` | Updates actual amount; `estimatedAmount` stays frozen |
| `addActivity(tripId, dayIndex, activity)` | Appends activity to a specific day |
| `deleteActivity(tripId, actId)` | Removes activity by id across all days |
| `addFamily(tripId, { name, members })` | Adds a new family with auto-assigned color |
| `addTraveler(tripId, famId, member)` | Appends member to a family |
| `addExpense(tripId, expense)` | Appends expense to trip |
| `deleteExpense(tripId, expId)` | Removes expense |

---

## 6. Multi-Agent Architecture

VoyVibe uses a 6-agent pipeline to generate AI trip plans. Each agent has a single responsibility. The pipeline is defined in `src/agents/pipeline.js` and called from `src/utils/plannerAPI.js`.

### 6.1 Agent Pipeline

```
callPlannerAPI(trip, travelers, options, onProgress)
        │
        │  (refinement request → legacyFallback, skips pipeline)
        │
        ▼
runPipeline() — src/agents/pipeline.js
        │
  ① FamilyProfileAgent  [SEQUENTIAL · no API]
        Reads trip.families[] + global travelers[]
        Outputs GroupProfile: age groups, accessibility flags, dietary needs,
        interests, room requirements, pace/budget, human-readable flags[]
        │
  ② ─── Promise.all (saves ~40% time) ────────────────────────
     StayAgent            ExperienceAgent       TransitAgent
     Hotels filtered       Activities scored     Drive/fly/train
     by accessibility,     by age/interests/     routing, multi-
     family rooms,         accessibility         city detection,
     budget fit            (mock → Places API)   local transport
  ─────────────────────────────────────────────────────────────
        │
  ③ FamilyBudgetAgent  [SEQUENTIAL · pure JS · VOYVIBE MOAT]
        Per-family breakdown:
          accommodation = rooms × roomRate × nights
          transit/meals/activities = costPerPerson × familyMemberCount
          + 12% contingency buffer
        Outputs Expense[] with participatingFamilies: [thisFamily.id]
        → auto-populates Splitwise tab with no manual entry
        │
  ④ ItineraryAgent  [SEQUENTIAL · claude-haiku-4-5-20251001]
        Receives: GroupProfile + hotel options + experiences + transit info
        Sends: structured prompt to Claude haiku
        Parses: Activity[][] matching VoyVibe schema
        Falls back to: legacyFallback() if API fails or parse error
        │
        ▼
  Returns { dayActivities, budgetByFamily, expenses, groupProfile, meta }
        │
store.applyPlannedActivities(tripId, dayActivities)
  Writes activities to trip.days[]
  If dayActivities._budget present → writes expenses, sets itineraryPushed: true
```

### 6.2 Agent Files Reference

| File | Type | API | Phase 2 upgrade |
|---|---|---|---|
| `FamilyProfileAgent.js` | Sequential | None | No change needed |
| `StayAgent.js` | Parallel | Mock data | Google Places Nearby Search |
| `ExperienceAgent.js` | Parallel | Mock data | Google Places + Viator API |
| `TransitAgent.js` | Parallel | Mock data | Google Maps Directions + Skyscanner |
| `FamilyBudgetAgent.js` | Sequential | None | Wire real hotel prices from StayAgent |
| `ItineraryAgent.js` | Sequential | Claude haiku | Move to Cloudflare Worker |

### 6.3 FamilyBudgetAgent — The Moat

Competitors split expenses equally per head. VoyVibe splits by what each family actually uses:

```
Family A (2 adults, 2 kids, needs 2 rooms):
  Accommodation = 2 rooms × $160/night × 5 nights = $1,600
  Transit       = $45/person × 4 members = $180
  Activities    = $30/person × 4 members = $120
  Meals         = $55/person × 4 members = $220
  12% buffer    = $252
  Total         = $2,372

Family B (2 adults, needs 1 room):
  Accommodation = 1 room × $160/night × 5 nights = $800
  Transit       = $45/person × 2 members = $90
  ...
  Total         = $1,108
```

Each family's expenses are stored with `participatingFamilies: [thisFamily.id]` — so Splitwise shows each family their real cost.

### 6.4 Fallback Chain

When a stage fails, the pipeline degrades gracefully:

```
ItineraryAgent (Claude haiku) fails
  → legacyFallback: single Claude API call (claude-haiku)
      → known-destination DB (itineraryPlanner.js — SD/LA/SF)
          → generic template plan (buildGenericPlan)
```

All paths return the same `Activity[][]` shape. The rest of the app doesn't know which path was used.

### 6.5 Phase 2: Cloudflare Workers Backend

The current architecture makes Claude API calls directly from the React Native app (API key exposed in `config.js`). Phase 2 wraps the pipeline in a Cloudflare Worker:

```
App → POST https://api.voyvibe.com/api/plan → Cloudflare Worker
  Worker runs the agent pipeline server-side
  CLAUDE_API_KEY stays secret
  Google Places API calls proxied through Worker
  Rate limiting + analytics added at the edge
```

When building Phase 2, the interface contract is unchanged — `callPlannerAPI` still returns `Activity[][]` with `._budget` attached.

---

## 7. Expense Splitting Logic (`costs.js`)

The split engine lives in `src/utils/costs.js`. It supports two modes:

- **Individual mode** — cost ÷ number of participating members. Each member can be toggled in or out of a specific expense.
- **Family mode** — cost ÷ number of participating families (insurance-style). Only the **first member** of each family (the "family head") carries the debt in balances.

### 6.1 Mode Resolution

Expense-level `splitMode` overrides the trip-level `splitMode`. If neither is set, defaults to `"individual"`.

```js
resolveMode(exp, trip) => exp.splitMode || trip.splitMode || 'individual'
```

### 6.2 Key Functions

| Function | Returns |
|---|---|
| `resolveMode(exp, trip)` | Effective split mode string |
| `getEffectiveFamilies(exp, trip)` | Families participating in this expense (defaults to all) |
| `getEffectiveMembers(exp, trip)` | Members participating, respecting mode + `participatingMembers` |
| `expSharePerFamily(exp, trip)` | Amount owed per family (family mode) |
| `expSharePerPerson(exp, trip)` | Amount owed per person (individual mode) |
| `famExpenseShare(fam, exp, trip)` | How much one family owes for one expense |
| `memberExpenseShare(member, exp, trip)` | How much one member owes (0 for non-heads in family mode) |
| `calcFamilyExpenseTotal(fam, trip)` | Total owed by one family across all non-excluded expenses |
| `calcMemberExpenseShare(member, trip)` | Total owed by one member across all non-excluded expenses |
| `calcBalances(trip)` | Net balance per member (paid − owed), skips excluded expenses |
| `calcSettlements(balances)` | Minimal set of transfers to settle all debts |

### 6.3 Settlement Algorithm

```js
// Greedy min-transfer: sort by net balance descending
// credits (net > 0) pay off debts (net < 0) one at a time
// Each iteration produces one transfer, amount = min(credit, debt)
```

---

## 8. Theme & Design Tokens

All colors, spacing, and typography are exported from `src/theme.js`. **Never hardcode design values in component files.**

```js
// Colors
colors.primary       // Brand blue
colors.green         // Success / cost amounts
colors.yellow        // Highlight (banner totals)
colors.bg            // Page background
colors.surface       // Card background
colors.surface2      // Secondary card / input background
colors.border        // Dividers and input borders
colors.text          // Primary text
colors.muted         // Secondary / placeholder text
colors.ai            // AI mode accent
colors.expert        // Expert mode accent
colors.primaryLight  // Light tint of primary (active tab bg)
colors.greenLight    // Light tint of green
colors.yellowLight   // Light tint of yellow

// Spacing (px)
spacing.xs = 4
spacing.sm = 8
spacing.md = 12
spacing.lg = 16
spacing.xl = 20
spacing.xxl = 24   // Standard screen horizontal padding

// Border radius
radius.sm = 8
radius.md = 12
radius.lg = 16
radius.full = 999

// Typography (objects with fontSize, fontWeight, lineHeight)
typography.h1 / h2 / h3 / h4
typography.body / bodyBold
typography.small / smallBold
typography.tiny / tinyBold

// Shadows
shadow.sm   // Subtle card shadow
shadow.md   // Elevated card shadow

// Activity theming (keyed by type: food/transport/stay/activity)
activityColors   // border-left accent colors
activityIcons    // emoji per type
```

---

## 9. Key Features Built

### 9.1 Multi-Agent Planning Pipeline

The AI planning system was rebuilt from a single LLM call to a 6-agent pipeline:

- **FamilyProfileAgent** — pure JS, builds a `GroupProfile` from all traveler data. Feeds every downstream agent.
- **StayAgent / ExperienceAgent / TransitAgent** — run in parallel via `Promise.all`. Return scored hotel options, age-appropriate activities, and transit routes. Phase 1 uses mock data; Phase 2 wires to Google Places.
- **FamilyBudgetAgent** — computes per-family cost breakdown (rooms × nights + members × activities/meals/transit + 12% buffer). Outputs `Expense[]` that auto-populates the Splitwise tab. This is VoyVibe's moat — no competitor does per-family accommodation cost splitting.
- **ItineraryAgent** — calls `claude-haiku-4-5-20251001` with enriched context from all agents, returns `Activity[][]` matching the existing VoyVibe schema.

The entire pipeline falls back gracefully at each stage — if Claude is unavailable, it uses the destination database; if that fails, generic templates.

### 9.2 New Trip Wizard (`NewTripModal`)

- **Step 1** — Mode selection: AI Planned, Expert (Coming Soon), or Manual.
- **Step 2** — Trip name, destination, and date range via custom `DateRangePicker`.
- **Step 3** — Families and travelers with collapsible family boxes. Each family box shows a member name summary when collapsed.
- Expert-mode trips show a "Coming Soon" placeholder in Itinerary and Splitwise tabs; Travelers tab is always active.

### 9.3 Custom DateRangePicker

Built from scratch with no third-party library. Renders 2 scrollable months. First tap sets `startDate`, second tap sets `endDate`. Range days are highlighted. Used in both `NewTripModal` and `EditTripModal`.

### 9.4 Itinerary Screen

- Cost banner: total trip estimate, per-family breakdown.
- Bar chart: per-day spend, active day highlighted in green, tap a bar to jump to that day.
- Day navigation strip: horizontal scroll of day chips with mini cost labels.
- Activity cards: sorted by time, with type icon, cost/person, and accessibility info.
- "Move to Splitwise" button calls `pushItineraryToSplitwise()` and switches to the Splitwise tab.

### 9.5 Splitwise Screen

- **Dual-mode toggle**: By Person (individual) vs By Group (family/insurance).
- Per-expense mode override chips (inherit / individual / family).
- **Exclude** (soft-skip) individual line items — shown as strikethrough, not deleted.
- Edit actual amount vs the frozen estimate reference.
- Per-item delete for itinerary-sourced expenses.
- Settlement summary: net balances + minimal transfer arrows.

### 9.6 AddExpenseModal

- Fields: name, amount, category emoji, payer (avatar picker).
- Family mode: Switch toggle per family.
- Individual mode: per-member toggles grouped by family, with "Add all / Remove all" helpers.
- Summary pill shows live `/group` or `/person` share preview.

### 9.7 Trip Management (TripScreen ⋮ menu)

- **Edit** — opens `EditTripModal` (name, destination, dates; existing days unchanged).
- **Duplicate** — `Alert` confirm → `duplicateTrip()` (deep clone, fresh UIDs, cleared expenses).
- **Share** — native `Share.share()` with formatted trip summary text.
- **Delete** — destructive `Alert` confirm → `deleteTrip()` → navigate back to Home.

---

## 10. Common Issues & Fixes

| Issue | Fix |
|---|---|
| `"familyPalette is not iterable"` crash on Create Trip | Export `familyPalette` from `src/utils/helpers.js` — it was imported by the store but never exported, causing `undefined.length` to crash. |
| `git add` blocked by stale `index.lock` | Run `del .git\index.lock` in a Windows terminal (PowerShell or CMD), then retry `git add`. |
| Expo Go shows blank screen after code change | Shake phone → Reload, or press `r` in the terminal running `npx expo start`. |
| AsyncStorage data stale after store shape change | Clear app data on the device or change the `name` key in `store/index.js` to force a fresh hydration. |
| `PanResponder` slider fighting `ScrollView` | Set `onMoveShouldSetPanResponder` to only capture when `Math.abs(gs.dx) > Math.abs(gs.dy)` (horizontal gesture). |
| `DateRangePicker` mounted outside parent `Modal` | Render `DateRangePicker` as a sibling of `Modal`, not inside it, to avoid nested modal stacking issues on iOS. |
| Pipeline result missing `._budget` | `legacyFallback()` returns a plain `Activity[][]` without `._budget`. If Splitwise auto-population is required on a custom path, attach `._budget` manually before returning. |
| Agent mock data used instead of real data | Phase 1 uses mock hotel/activity/transit data. Phase 2 replaces with Google Places API. Don't add real API calls to agents yet — flag as a Phase 2 task. |
| `itineraryPushed` not set after AI plan | Only `applyPlannedActivities` (with `._budget`) or `pushItineraryToSplitwise` set this flag. The AI plan must reach one of those store actions. |
| Dangling `paidBy` after member delete | Known bug. On `deleteMember`, reassign `paidBy` on affected expenses to first remaining member in the same family. Not yet implemented. |

---

## 11. Claude + Developer Collaboration Model

This project is developed using Anthropic's **Cowork** product, where Claude acts as a co-developer with direct file access.

| Claude does | Developer does |
|---|---|
| Reads and writes source files directly | Runs `npx expo start` in VS Code terminal |
| Designs and implements features | Tests on iPhone via Expo Go |
| Refactors, fixes bugs, rewrites components | Reviews changes and gives feedback |
| Maintains store actions and cost logic | Handles `git add`, `commit`, `push` |
| Cannot run the dev server or install packages | Installs new npm packages if Claude flags the need |

### The Loop

```
Claude edits files
       ↓
Expo hot-reloads automatically
       ↓
Developer tests on iPhone
       ↓
Developer gives feedback in Cowork chat
       ↓
Claude makes next change
```

When Claude says "restart Expo" or "run npm install", those commands must be run **manually in the VS Code terminal**. Hot reload handles most changes; full restarts are only needed for new native modules (which this project avoids by design).

---

## 12. Product Vision — Manual Planning Focus

> **Strategic context (June 2026):** AI planning features carry per-call API cost and compete in a crowded space (Tripmind.ai, Wonderlog). VoyVibe's defensible moat is multi-family group travel — specifically the per-family expense model no competitor has. The near-term focus is making manual planning so good that users don't need AI to get value on day one.

### 12.1 Why manual-first

Wonderlog and Tripmind serve individual or couple travelers well. Neither models families as first-class objects — rooms, member counts, accessibility needs, and per-family cost splits are absent. VoyVibe owns that space. The goal is to be the planner a family organizer reaches for because it solves problems the other tools can't, not because it has the most AI features.

### 12.2 The six pain areas to solve

**Pain 1 — Discovery friction** *(Priority: High)*

The hardest part of manual planning is staring at a blank day. A planner adds an activity only if they already know what it is. A "Find nearby" button that queries Google Places for the current destination and lets you tap-to-add eliminates the biggest drop-off point in the planning flow. The Places API integration is already wired inside the AI pipeline (`StayAgent`, `ExperienceAgent`) — it can be exposed directly in `AddActivityModal` or as an inline search in each day slot without new infrastructure.

Architectural note: `src/agents/ExperienceAgent.js` and `StayAgent.js` already contain the Google Places Text Search (New) call with field masks, fallback logic, and mock data. Reuse those functions directly rather than re-implementing.

---

**Pain 2 — Transit gaps are invisible** *(Priority: Medium)*

A planner schedules Disneyland at 9am and lunch at 12:30pm with no idea those venues are 40 minutes apart. The Check Trip engine (`src/utils/tripValidator.js`) catches time overlaps but not travel time gaps. A "~35 min drive" indicator between sequentially-scheduled activities that are geographically far apart would surface real headaches before the trip, not on the day.

Activities sourced from the AI pipeline already carry `lat` and `lng` fields. Haversine distance between adjacent activities can approximate drive time (using ~50 km/h average for city driving) with no additional API call. A more accurate version would call the Google Routes API in Phase 2.

---

**Pain 3 — No shareable view** *(Priority: High)*

The trip organizer does all the work but everyone else asks "what are we doing on Day 3?" via WhatsApp. VoyVibe should be the single source of truth for the whole group, not just the planner. A per-day PDF export (using `expo-print`, already installed and unused) or a formatted text share (native `Share.share()`, already wired in `TripScreen`) would close this gap immediately.

The PDF should show: day header, activity timeline with times and icons, cost-per-person per activity, and a family totals footer. `expo-print` accepts HTML, so the same layout used in `VoyVibe_App_Flow.html` is a starting point.

---

**Pain 4 — Budget blindness during planning** *(Priority: Medium)*

A planner adds a $150/person activity without realising the day is already $800 per family. Real-time day-budget feedback as activities are added — "Day 3 is now $1,240 for the Sharma family" — helps planners make cost tradeoffs on the spot rather than getting sticker shock in the Splitwise tab.

The calculation already exists: `calcDayCostForTrip(day, trip)` and `calcFamilyItineraryCost(trip, famId)` in `src/utils/costs.js`. The data is available; it just needs surfacing inline in `AddActivityModal` or as a persistent indicator in the day header.

---

**Pain 5 — Accessibility needs are never surfaced during planning** *(Priority: High)*

When Family A has a wheelchair user and Family B has a 2-year-old, the organizer is mentally tracking all of that. Traveler needs tags already exist (`member.needs[]` — `♿ Wheelchair`, `🍼 Infant`, `🌿 Vegetarian`, etc.) but they are never shown during itinerary planning. A warning indicator on an activity card or in `AddActivityModal` — "⚠️ Amara uses a wheelchair — verify accessibility" — would make this visible at the right moment.

No competitor does this because no competitor models individual travelers and their needs within a group context. This is directly defensible.

Implementation: when `itineraryPushed` is true and an activity has no `access` field set, check whether any trip member has `needs` containing `♿ Wheelchair` or `🧑‍🦯 Blind` and surface a warning. The Check Trip engine (`tripValidator.js`) is the right place to add this as a new rule.

---

**Pain 6 — The coordination tax** *(Priority: Low — Phase 2)*

One person plans everything and the other 14 people just show up. A lightweight "pending" activity state — where the organizer proposes an activity and families can confirm or flag a conflict — would distribute the planning load and reduce day-of surprises. This requires multi-device sync (backend) and is a Phase 2 concern, but the activity schema already has a `status` field that could be extended to support `'proposed'` alongside `'done'` and `'skipped'`.

---

### 12.3 Build order recommendation

| # | Feature | Effort | Why now |
|---|---|---|---|
| 1 | Accessibility warnings in Check Trip | Small | Reuses existing validator + needs data |
| 2 | Day PDF / share export | Small | expo-print installed, no new infra |
| 3 | "Find nearby" activity discovery | Medium | Places API already in agents |
| 4 | Live day-budget in AddActivityModal | Medium | Costs already calculated |
| 5 | Transit gap detection | Medium | lat/lng on AI activities, haversine is simple |
| 6 | Coordination / pending state | Large | Needs backend sync |

### 12.4 What VoyVibe is NOT competing on

- General solo or couple travel — Wanderlog owns that
- AI itinerary generation for common destinations — Tripmind.ai does this at scale
- Hotel/flight booking — OTA territory, out of scope

VoyVibe wins on: **multi-family group dynamics, per-family cost transparency, and accessibility-aware planning**. Every feature should reinforce at least one of those three.

---

## Appendix: File Quick Reference

```
VoyVibeFresh/
├── AGENTS.md                   AI agent quick-start guide ← read first
├── CLAUDE.md                   Redirects to AGENTS.md
└── src/
    ├── agents/                 Multi-agent pipeline (Phase 1)
    │   ├── pipeline.js         Orchestrator entry point
    │   ├── FamilyProfileAgent.js  GroupProfile builder
    │   ├── StayAgent.js        Hotel search (mock)
    │   ├── ExperienceAgent.js  Activity search (mock)
    │   ├── TransitAgent.js     Transit routing (mock)
    │   ├── FamilyBudgetAgent.js  Per-family cost → Expense[]
    │   └── ItineraryAgent.js   Claude haiku synthesis
    ├── screens/
    │   ├── HomeScreen.js       Trip list + testing banner
    │   ├── TripScreen.js       Tab shell + ⋮ menu
    │   ├── ItineraryScreen.js  Day planner + chart
    │   ├── TravelersScreen.js  Family roster + traveler library
    │   ├── SplitwiseScreen.js  Expense splitting
    │   └── ProfilesScreen.js   Global traveler profiles
    ├── modals/
    │   ├── NewTripModal.js     3-step create wizard
    │   ├── AIPlannerModal.js   AI planning options + preview
    │   ├── AIChatModal.js      Trip AI chat
    │   ├── EditTripModal.js    Edit name/dest/dates
    │   ├── AddActivityModal.js Add itinerary activity
    │   ├── AddExpenseModal.js  Log real expense
    │   ├── AddProfileModal.js  Create/edit global traveler profile
    │   └── AddGroupToTripModal.js  Add saved group to trip
    ├── components/ui/
    │   ├── DateRangePicker.js  Custom calendar picker
    │   ├── FormField.js        Labeled text input
    │   ├── InfoBanner.js       Coloured notice/tip box
    │   └── ModalHeader.js      Cancel / Action header bar
    ├── store/
    │   └── index.js            Zustand store (all state + actions)
    ├── utils/
    │   ├── plannerAPI.js       Planning entry point (calls pipeline)
    │   ├── aiAssist.js         Rule-based gap detection + AI chat context
    │   ├── itineraryPlanner.js Known-destination activity DB (SD/LA/SF)
    │   ├── plannerRules.js     Single-LLM prompt builders (legacy fallback)
    │   ├── helpers.js          uid, fmt, fmtM, getAllMembers, effectiveMember
    │   └── costs.js            Split engine (resolveMode → calcSettlements)
    ├── data/
    │   └── sampleData.js       Seed trips/travelers/groups for first launch
    ├── config.js               API keys + feature flags
    └── theme.js                Colors, spacing, radius, typography, shadow
```

---

*VoyVibe Developer Guide · Internal · June 2026*
