# Voyara — AI Agent Guide & Architecture

> **Read this first.** Everything an AI agent needs to work on this codebase without asking follow-up questions.
> Last updated: May 2026 · Stack: React Native · Expo 54 · Zustand · Claude API · Google Places API

---

## Product Vision

Voyara is the **only travel planner built for multi-family group travel**. The core insight no competitor has: when multiple families travel together, expenses don't split equally per person — accommodation splits by rooms, transit splits by family size. Voyara tracks this automatically.

**Platform:** iOS-first mobile app (React Native + Expo Go for development, EAS Build for distribution).

**Three features that define Voyara:**
1. **Multi-family itinerary** — day-by-day planning with accessibility filtering per traveler profile
2. **Per-family expense splitting** — hotels split by rooms × nights; transit/meals/activities split by member count
3. **AI agent pipeline** — 6 specialist agents run to produce group-profile-aware trip plans

---

## Architecture

### Current State — Phase 1 (Live)

```
iPhone (Expo Go)
  │
  └── VoyaraFresh/   React Native + Expo 54
        │
        │  User triggers AI planning (AIPlannerModal)
        ▼
  src/utils/plannerAPI.js → src/agents/pipeline.js
        │
        ├─ 1. FamilyProfileAgent  [SEQUENTIAL · no API]
        │     Builds GroupProfile: ages, wheelchair, stroller,
        │     dietary, interests, rooms needed per family
        │
        ├─ 2. ──── Promise.all (parallel) ────────────────────
        │     StayAgent              ExperienceAgent          TransitAgent
        │     Google Places API  ←→  Google Places API    ←→  Mock routes
        │     (hotels · live)        (attractions · live)     (Phase 2: Routes API)
        │     ─────────────────────────────────────────────────────────────────────
        │
        ├─ 3. FamilyBudgetAgent  [SEQUENTIAL · pure JS · THE MOAT]
        │     rooms×nights + transit×members + meals×members + 12% buffer
        │     → Expense[] auto-populates Splitwise tab per family
        │
        └─ 4. ItineraryAgent     [SEQUENTIAL · Claude claude-haiku-4-5-20251001]
              Synthesises all agent outputs → Activity[][]
              Falls back to legacyFallback (simpler Claude prompt) if parse fails

        ▼
  TripPlan → Zustand Store (persisted via AsyncStorage)
    trip.days[].activities[]    ← itinerary
    trip.expenses[]             ← auto-populated, per-family Splitwise entries
    trip.budgetByFamily[]       ← per-family totals
```

### Phase 2 — FastAPI Backend (Planned)

```
iPhone (VoyaraFresh)
  │
  │  HTTP + WebSocket
  ▼
FastAPI Backend (Python)
  ├── REST endpoints      /api/plan · /api/trips · /api/chat
  ├── WebSocket / SSE     Real-time streaming agent progress to app
  ├── LangGraph Pipeline  Replaces pipeline.js — stateful, resumable, streaming
  │     FamilyProfileNode → [StayNode ‖ ExperienceNode ‖ TransitNode] → BudgetNode → ItineraryNode
  ├── SQLite → PostgreSQL  Trip persistence + cross-device sync
  └── API keys server-side Claude + Google Places + Gemini Search (no keys in app bundle)
```

**Why Phase 2 matters:**
- API keys move off the device (required for App Store + security)
- LangGraph adds: stateful checkpoints, human-in-the-loop refinements, per-node retry, streaming
- SQLite gives trips persistence across reinstalls and eventually cross-device sync
- Gemini Search replaces the mock activity database with live destination intelligence

**Phase 2 tech stack:** Python · FastAPI · LangGraph · SQLite → PostgreSQL · Claude Sonnet · Google Places · Gemini

### Phase 3 — Production

- Real hotel pricing via Booking.com affiliate API
- Google Maps Directions for real transit times
- Supabase/Firebase Auth (replace local account flag)
- App Store submission (EAS Build → TestFlight → production)

---

## API Keys (current)

| Key | Location | Status |
|-----|----------|--------|
| `CLAUDE_API_KEY` | `src/config.js` | ✅ Live — `claude-haiku-4-5-20251001` |
| `GOOGLE_PLACES_API_KEY` | `src/config.js` | ✅ Live — Text Search (New) |
| `CLAUDE_API_URL` | `src/config.js` | `https://api.anthropic.com/v1/messages` |

> ⚠️ For production/App Store: move all API keys to FastAPI backend. Never ship keys in the app bundle.

---

## File Map

### Agents (`src/agents/`) — the AI pipeline
```
pipeline.js           Orchestrator. Entry point for all AI trip planning.
FamilyProfileAgent.js Builds GroupProfile from trip.families[] + global travelers[]
StayAgent.js          Hotel search via Google Places API (live) · falls back to mock
ExperienceAgent.js    Activity search via Google Places API (live) · falls back to mock
TransitAgent.js       Drive/fly/train routing · mock data (Phase 2: Routes API)
FamilyBudgetAgent.js  Per-family cost breakdown → Expense[] for Splitwise (THE MOAT)
ItineraryAgent.js     Claude API call synthesising all agent data → Activity[][]
```

### Screens (`src/screens/`)
```
HomeScreen.js         Trip list + new trip CTA
TripScreen.js         Tab shell: Itinerary / Travelers / Splitwise + ⋮ menu
ItineraryScreen.js    Day planner, cost chart, push-to-splitwise button
TravelersScreen.js    Family/member roster, needs tags, global traveler library
SplitwiseScreen.js    Expense cards, family summary panel, settlement calculations
ProfilesScreen.js     Global traveler profile management
```

### Modals (`src/modals/`)
```
AIPlannerModal.js     Pace/budget/focus/notes → calls callPlannerAPI → plan preview
                      READY phase has live refinement chat bar (KeyboardAvoidingView)
AIChatModal.js        Per-trip AI chat via Claude API (KeyboardAvoidingView — fixed May 2026)
NewTripModal.js       3-step wizard: mode → details+dates → travelers
EditTripModal.js      Edit name/destination/dates (has destructive-change guard)
AddActivityModal.js   Add/edit activity on a specific day
AddExpenseModal.js    Manual expense: payer + family/member participation toggles
AddProfileModal.js    Create/edit global traveler profile
AddFamilyModal.js     Add new family group to a trip
AddGroupToTripModal.js Add a saved group in one tap
SelectTravelersModal.js Pick travelers from global library
AuthModal.js          Sign up / sign in (demo — no real auth yet)
BuyCreditsModal.js    Credit pack purchase (demo)
ChangeModeModal.js    Switch planning mode on existing trip
```

### Core Utils (`src/utils/`)
```
plannerAPI.js         Main planning entry point. Routes to pipeline or legacyFallback.
                      Refinements correctly pass currentPlan through to Claude (fixed May 2026)
aiAssist.js           Rule-based itinerary gap detection (free, zero API cost).
                      buildTripContext() for AI chat system prompt.
itineraryPlanner.js   Curated activity DB for SD/LA/SF. Used by legacyFallback simulation.
plannerRules.js       System + user prompt builders for single-LLM legacy path.
                      buildRefinementPrompt() includes current plan for Claude context.
helpers.js            uid(), fmt(), fmtM(), getAllMembers(), effectiveMember(), familyPalette
costs.js              Split engine: resolveMode → calcBalances → calcSettlements
useKeyboardOffset.js  Keyboard height hook (kept for future use; AIChatModal now uses KAV)
```

### State & Config
```
src/store/index.js    Zustand store. ALL global state + actions. Persisted to AsyncStorage.
src/config.js         CLAUDE_API_KEY · GOOGLE_PLACES_API_KEY · CLAUDE_MODEL · billing config
src/theme.js          colors, spacing, radius, typography, shadow, activityColors
src/data/sampleData.js Seed trips/travelers/groups for first launch
```

---

## Key Data Schemas

### Trip
```js
{
  id, name, destination, emoji,
  startDate, endDate,            // ISO 'YYYY-MM-DD'
  mode:             'ai' | 'manual' | 'expert',
  pace:             'relaxed' | 'moderate' | 'packed',
  budget:           'budget' | 'mid-range' | 'luxury',
  focus:            string[],
  splitMode:        'individual' | 'family',
  bgColors:         [string, string],
  itineraryPushed:  boolean,
  families:         Family[],
  days:             Day[],
  expenses:         Expense[],
  budgetByFamily:   FamilyBudget[],
  agentMeta:        object | null,
}
```

### Family + Member
```js
// Family
{ id, name, color, members: Member[] }

// Member
{
  id, travelerId, name, age,
  needs: string[],      // '♿ Wheelchair', '🌿 Vegetarian', '🍼 Infant', ...
  dietary, interests,
  pacePreference, notes,
  _nameOverride: boolean,
}
```

### Activity
```js
{
  id, type: 'transport'|'stay'|'food'|'activity',
  time: 'HH:MM',
  name, detail, access,
  costPerPerson: number,   // ALWAYS per-person. 0 if free.
  address, url, mapUrl, rating, note, lat, lng,
}
```

### Expense
```js
{
  id, name, amount, estimatedAmount,   // estimatedAmount is FROZEN
  category: '🏨'|'✈️'|'🍽️'|'🎯',
  paidBy: memberId,
  splitMode: null | 'individual' | 'family',
  participatingFamilies: string[],     // SOURCE OF TRUTH
  participatingMembers: string[] | null,
  excluded: boolean,
  source: 'itinerary' | undefined,
  activityId: string | null,
  familyId: string | null,
}
```

---

## Planning Flow

```
User opens AIPlannerModal → sets pace/budget/focus/notes → taps Generate
  ↓
callPlannerAPI (plannerAPI.js)
  if refinement → legacyFallback(trip, travelers, options, onProgress, refinement, currentPlan)
                  → callClaudeAPI with buildRefinementPrompt (includes currentPlan)
                  → if no API key: mutate currentPlan + applyNoteOverrides (preserves existing plan)
  else          → runPipeline (pipeline.js)
                  → Stage 1: FamilyProfileAgent (sync)
                  → Stage 2: StayAgent ‖ ExperienceAgent ‖ TransitAgent (parallel, Google Places)
                  → Stage 3: FamilyBudgetAgent preview
                  → Stage 4: ItineraryAgent → Claude API → Activity[][]
                             if null → legacyFallback → Claude API or simulation
                  → Stage 3b: FamilyBudgetAgent final
  ↓
result._budget attached → applyPlannedActivities(tripId, dayActivities)
  ↓
store writes activities + expenses + itineraryPushed = true
  ↓
UI updates (Zustand reactive)
```

---

## FamilyBudgetAgent — The Moat

```
accommodation = family.roomsNeeded × roomRatePerNight × nights
transit       = transitCostPerPerson × family.memberCount
meals         = mealCostPerPerson × family.memberCount
activities    = activityCostPerPerson × family.memberCount
buffer        = subtotal × 0.12   (12% contingency)
total         = subtotal + buffer

Each family gets Expense[] with participatingFamilies: [thisFamily.id]
→ Splitwise shows each family's REAL cost, not a shared average
```

---

## Critical Invariants — Never Break

1. **`participatingFamilies` is the source of truth** for splitting. Use `getExpSplitBetween(exp, trip)` from `costs.js`.
2. **`estimatedAmount` is frozen.** Only update `amount`. Never overwrite `estimatedAmount`.
3. **`costPerPerson` is always per-person.** All cost math multiplies by member count.
4. **At least one family must always participate** in an expense (`toggleFamilySplit` guard).
5. **`trip.days[]` is not regenerated when dates change.** `EditTripModal` has a destructive-change guard.
6. **Always use `effectiveMember(member, travelers)`** from `helpers.js`. Never read `tripMember.dietary` directly.

---

## Store — Key Actions

| Action | What it does |
|---|---|
| `createTrip(params)` | Builds trip + families + days from date range |
| `applyPlannedActivities(tripId, dayActivities)` | Writes activities + auto-populates expenses if `._budget` attached |
| `addActivity(tripId, dayIdx, activity)` | Adds activity. If `itineraryPushed`, auto-adds linked expense |
| `updateActivity(tripId, actId, updates)` | Updates activity + syncs linked expense amount |
| `deleteActivity(tripId, actId)` | Removes activity + linked expense |
| `toggleFamilySplit(tripId, expId, famId, checked)` | Adds/removes family from `participatingFamilies` (enforces at-least-one) |
| `updateExpensePayer(tripId, expId, memberId)` | Updates payer + auto-includes their family |
| `toggleExpenseExcluded(tripId, expId)` | Soft-hides expense from settlement |

---

## Working Conventions

**Theme:** Always `import { colors, spacing, ... } from '../theme'`. Never hardcode hex or px.

**Keyboard in modals:** Use `KeyboardAvoidingView` with `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` wrapping messages + input. Do NOT use `useKeyboardOffset` for chat/input UIs.

**No SVG:** `react-native-svg` not installed. Build charts with plain Views.

**Store patterns:**
```js
// ✅ Correct
const m = effectiveMember(tripMember, travelers);
const participants = getExpSplitBetween(exp, trip);

// ❌ Never
tripMember.dietary  // may miss global profile defaults
```

**Agent patterns:**
```js
// ✅ Agents are pure functions — no store access, no side effects
export async function run(groupProfile, destination, nights) { ... return results; }
```

**Google Places (StayAgent + ExperienceAgent):** Uses Text Search (New) API. Falls back to mock data silently on error. Field mask: `places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types,places.accessibilityOptions,places.websiteUri`.

**Package installs:** Flag if a new npm package is needed — requires `npm install`. App targets Expo Go; native-code packages need EAS Build.

---

## Common Gotchas

| Issue | Fix |
|---|---|
| AsyncStorage stale after store schema change | Change `name:` in `store/index.js` to `'voyara-storage-v2'` etc. |
| `._budget` missing on returned dayActivities | `legacyFallback` returns a plain array — check if `._budget` needs manual attachment |
| Refinement bypasses pipeline | Intentional — refinements go through `legacyFallback` with `currentPlan`. Pipeline is for fresh plans only. |
| Google Places returns no results | API falls back to `MOCK_HOTELS` / `GENERIC_HOTELS` automatically — check console for `[StayAgent]` logs |
| ItineraryAgent parse fails | Claude returned malformed JSON — check console for `[ItineraryAgent] Could not parse` then check `legacyFallback` path |
| Dangling `paidBy` after member delete | Known bug — on `deleteMember`, reassign `paidBy` on affected expenses to first remaining member |

---

## Phase 2 Backlog (what comes next)

| # | Feature | Why |
|---|---------|-----|
| 1 | **FastAPI backend** | Move API keys server-side; required for App Store |
| 2 | **LangGraph pipeline** | Streaming, resumable, retryable agent runs |
| 3 | **SQLite persistence** | Trips survive reinstalls; future cross-device sync |
| 4 | **WebSocket streaming** | Show each agent completing live in the app |
| 5 | **Google Routes API** | Real drive/transit times in TransitAgent |
| 6 | **Gemini Search** | Replace mock activity DB with live destination intelligence |
| 7 | **Debug overlay** | In-app panel showing which agents ran + API hit/miss |
| 8 | **Real hotel prices** | Booking.com affiliate in FamilyBudgetAgent |
| 9 | **EAS Build → TestFlight** | Off Expo Go, onto real .ipa for testing |
| 10 | **Real auth** | Supabase/Firebase replacing `account.loggedIn` flag |

---

*Voyara · VoyaraFresh · Internal AI Agent Guide · Updated May 2026*
