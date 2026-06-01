# Voyara Changelog

All notable changes to VoyaraFresh are logged here, session by session.
Format: `[Date] · File(s) changed · What and why`

---

## Session — 31 May 2026 (continued — Part 13)

### ✨ UX — Option D: Sticky Mini-Header + Slide-up Detail Sheet

**Itinerary screen: sticky bar pinned above scroll, full detail on demand**
- `src/screens/ItineraryScreen.js`
- Replaced the `CollapsibleHeader` (inline, scrolls away with content) with a `StickyHeader` component placed **outside** the `ScrollView` — always visible regardless of scroll position.
- **Sticky bar (always on):** Full-width dark bar, 52pt tall. Left: `TRIP TOTAL / $X,XXX`. Separator. Right: `DAY N / $XXX  $XX/p`. Far right: `ⓘ` circular button.
- **ⓘ tap → slide-up Modal:** Sheet slides up from bottom with drag handle. Shows: trip total + traveller/day count, family totals (horizontal scroll), Spend by Day chart (compact mode), Push to Splitwise / Synced badge. Tapping a day bar selects that day and dismisses the sheet. Tap outside or ✕ to close.
- **Result:** Day Navigation → Day Header → Activities start immediately below the 52pt bar. Maximum screen real estate for planning.
- Added `Modal` to React Native imports.

---

## Session — 31 May 2026 (continued — Part 12)

### ✨ UX — Collapsible Mini-Header (B+D pattern)

**Itinerary screen: ~280px of top-chrome → one dark strip**
- `src/screens/ItineraryScreen.js`
- **Before:** 6 stacked sections before first activity — banner, chart, day nav, day header, cost strip, family pills (~490px on iPhone 15).
- **After:** One compact dark strip showing `TRIP $X,XXX  |  Day N  $XXX  $XX/p  ▾`. Tap to expand full breakdown.
- `CollapsibleHeader` component replaces the old `banner` View, `TripExpenseChart` call, `costStrip`, and `famPills` sections.
- **Collapsed (default):** single 52pt dark bar — trip total on left, active day cost + per-person on right, chevron toggle.
- **Expanded (tap ▾):** family trip totals (horizontal scroll) → Spend by Day bar chart (compact mode, no own background) → Push to Splitwise / Synced badge. Tapping any day bar in the chart also collapses the header so activities come into view.
- `TripExpenseChart` gains a `compact` prop — suppresses its own dark background/margins so it renders cleanly inside the collapsible card.
- Removed `costStrip` and `famPills` JSX sections — day nav pills already show per-day cost; family breakdown is in the expanded header.

---

## Session — 31 May 2026 (continued — Part 11)

### ✨ New Features

**AddActivityModal — Total Cost mode (3rd cost option)**
- `src/modals/AddActivityModal.js`
- Cost toggle is now 3-way: 👤 Per Person | 👨‍👩‍👧 Per Family | 💰 Total.
- Total mode: user enters the full shared cost (e.g. $900 for a group Airbnb). `costPerPerson = total / numMembers` is stored on the activity for budget and Splitwise calculations.
- Cost hint: "Shared total · $112.50/person across 8 travellers".
- Note tile icon changed from 📝 to 💬 (and renamed "Other") to avoid confusion with the Notes input field.

**Splitwise — Uneven / Custom split**
- `src/screens/SplitwiseScreen.js`, `src/utils/costs.js`, `src/store/index.js`
- Each expense card now has a **DISTRIBUTION** toggle: ⚖️ Even | ✏️ Custom.
- Even (default): existing even-per-person or even-per-family logic unchanged.
- Custom: shows a dollar input per participant (family in group mode, person in individual mode). Pre-seeded from the current even split so the user just adjusts deltas.
- Remaining balance indicator: shows unassigned amount in amber, over-allocated in red, ✅ Balanced in green.
- Custom amounts are saved to `exp.customShares` (keyed by famId or memberId) + `exp.unevenSplit: true`.
- `costs.js`: `famExpenseShare` and `memberExpenseShare` now check `exp.unevenSplit` first and read `exp.customShares[id]` directly — balances and settlements use exact custom amounts.
- `store`: added `updateExpenseCustomShares(tripId, expId, shares, unevenSplit)` action.

---

## Session — 31 May 2026 (continued — Part 10)

### ✨ Redesign — AddActivityModal

**Compact 4×2 type grid with transport subtypes**
- `src/modals/AddActivityModal.js` (full rewrite), `src/utils/helpers.js`, `src/screens/ItineraryScreen.js`
- Old: vertical chip list (one type per row, required scrolling past the fold).
- New: 4×2 icon tile grid — all 8 types visible without scrolling.
- Transport tiles: ✈️ Flight / 🚗 Drive / 🚂 Train / 🚢 Ship — each stores `type:'transport'` + `subtype:'flight'|'car'|'train'|'ship'` in the activity.
- Other tiles: 🏨 Stay / 🍽️ Meal / 🎯 Activity / 📝 Note.
- Added `getActivityIcon(type, subtype)` to `helpers.js` — used in ItineraryScreen ActivityCard to show the correct transport subtype icon.

**Per Person / Per Family cost toggle — the USP**
- Two-button toggle: 👤 Per Person | 👨‍👩‍👧 Per Family.
- Per Person: user enters $X → `costPerPerson = X`. Cost hint: "4 travellers → est. $120 total".
- Per Family: user enters $X → `costPerPerson = X / avgFamilySize` (for calculations). Cost hint: "3 families → est. $150 total". Badge shows purple "~$50/family".
- Stores `costMode`, `costAmount`, and `costPerPerson` on the activity.

**Removed Accessibility field**
- The `access` field remains in the activity schema (AI-generated plans populate it) but is no longer shown in the manual entry UI — it added friction with no real benefit for manual planners.

**Added Notes and Reminder fields**
- Notes (📌): personal memo shown on the activity card. "Pack sunscreen, book tickets in advance…"
- Reminder (🔔): free-text reminder shown in orange on the card. "Book 2 weeks ahead", "Check passport".
- Both stored as `memo` and `reminder` on the activity, shown in ItineraryScreen ActivityCard.

## Session — 31 May 2026 (continued — Part 9)

### 🏗️ Architecture — v1.0 Launch Scope

**Release feature flags**
- `src/config.js`, `src/modals/NewTripModal.js`, `src/modals/ChangeModeModal.js`, `src/screens/TripScreen.js`
- Added `RELEASE_FLAGS` object to `config.js`:
  ```
  manualPlanner: true   ✅ v1.0 launch
  aiPlanner:     false  🔜 v2.0 — needs backend
  expertMode:    false  🔜 v3.0 — needs consultant network
  aiReview:      false  🔜 v2.0 — needs backend
  ```
- NewTripModal + ChangeModeModal: disabled modes render grayed out (`modeCardDisabled` style, text/icon at 35–45% opacity) with a "Soon" pill replacing the radio button. Tapping shows a toast "coming in v2.0".
- TripScreen: "Plan with AI" / "Update Plan" button hidden when `RELEASE_FLAGS.aiPlanner` is false.
- To enable a feature for a future release: flip its flag to `true` in config.js — no other code changes needed.

**v1.0 launch scope confirmed:**
- ✅ Manual Planner — full day template with slots, completion checkboxes
- ✅ Family Splitwise — per-family expense splitting (the moat)
- ✅ PDF export
- ✅ Multi-family group management
- 🔜 AI Planner (v2.0)
- 🔜 AI Review / Chat (v2.0)
- 🔜 Expert Mode (v3.0)

## Session — 31 May 2026 (continued — Part 8)

### 🐛 Bug Fix

**Skipped activities excluded from Splitwise**
- `src/store/index.js`
- When an activity is marked "skipped", `markActivityStatus` now also sets `excluded: true` on any linked expense (`expense.activityId === actId`). The expense is soft-hidden from Splitwise settlement — it remains in the record but doesn't affect balances.
- When the activity is un-skipped (status → done or null), `excluded` is reset to `false` so the expense re-enters the settlement.
- Implemented as a single atomic update to both `days[].activities` and `expenses[]` in the same `set()` call — no partial state issues.

## Session — 31 May 2026 (continued — Part 7)

### ✨ New Features

**Day template: Morning / Afternoon / Evening / Night slots**
- `src/screens/ItineraryScreen.js`
- Activities are now grouped into 4 time slots: 🌅 Morning (before noon), ☀️ Afternoon (12–5 pm), 🌆 Evening (5–9 pm), 🌙 Night (after 9 pm).
- Each slot shows its own "+ Add" button. Tapping it opens AddActivityModal pre-filled with the slot's default time (09:00 / 13:00 / 18:00 / 21:00).
- When a day has activities, each slot header shows a progress indicator (✅ 2 / ↩️ 1) so you can see the day at a glance.
- Slots with no activities show a dashed "Nothing planned for [slot] · tap to add" placeholder.
- Empty days show a full template with 4 tappable slot cards (🌅 Morning / ☀️ Afternoon / 🌆 Evening / 🌙 Night) plus the "Plan with AI" prompt.

**Activity completion checkboxes**
- `src/screens/ItineraryScreen.js`, `src/store/index.js`
- Each activity card now has a circular checkbox on the left. One tap cycles through: ○ (not done) → ✅ Done (green) → ↩️ Skipped (gray) → ○.
- Done: card gets a green tint, status badge shows "✅ Done", name turns green.
- Skipped: card is dimmed (75% opacity), name gets strikethrough, status badge shows "↩️ Skipped", detail/tips/links hidden.
- Store: added `markActivityStatus(tripId, actId, status)` action — persists `activity.status` (null | 'done' | 'skipped') to AsyncStorage.
- Use cases: "woke up late, skip breakfast" → mark skipped; "finished the museum" → mark done.

**AddActivityModal: `defaultTime` prop**
- `src/modals/AddActivityModal.js`
- New `defaultTime` prop pre-fills the time field when opening from a specific slot. Falls back to '09:00'.

## Session — 31 May 2026 (continued — Part 6)

### ✨ New Feature

**Export trip as PDF**
- `src/utils/exportPlan.js` (new), `src/screens/TripScreen.js`
- Trigger: trip ⋮ menu → "📄 Export as PDF"
- Builds a full HTML itinerary → `expo-print.printToFileAsync()` → PDF file on device → `expo-sharing.shareAsync()` → iOS/Android native share sheet (save to Files, AirDrop, email, etc.)
- PDF includes: trip header + dates, family group cards with member details, 4-box summary (days/activities/per-person/group total), ℹ️ price disclaimer, full day-by-day itinerary with activity dots + costs, budget-by-family table (rooms×nights split — the moat), Splitwise expense list, Voyara footer.
- Uses dynamic import so the app doesn't crash if packages aren't yet installed — shows a helpful install message instead.
- **Requires one-time install:** `npx expo install expo-print expo-sharing` then restart Expo Go.

## Session — 31 May 2026 (continued — Part 5)

### 🐛 Bug Fix + ✨ UX

**Reliable discard guard — in-modal overlay replaces Alert.alert**
- `src/modals/AIPlannerModal.js`, `src/store/index.js`
- Root cause: `Alert.alert` inside `onRequestClose` is a race condition on iOS — pageSheet swipe-down commits the dismiss animation before the Alert renders, so the modal closes silently.
- Fix: replaced Alert with an in-modal overlay (`discardOverlay` + `discardCard`), rendered at `zIndex: 999` inside the modal. The overlay shows three options: "← Keep plan", "✅ Apply now" (applies and closes cleanly), "Discard" (confirms and discards).
- Added explicit ✕ close button in the ready phase header — tapping it shows the same overlay.
- `onRequestClose` now just calls `setShowDiscardConfirm(true)` — the overlay handles the user decision.

**Auto-save draft plan to store**
- `src/store/index.js`: added `saveDraftPlan(tripId, plan)` and `clearDraftPlan(tripId)` actions. Saves to `trip.draftPlan` + `trip.draftPlanTs` in Zustand (persisted via AsyncStorage).
- `src/modals/AIPlannerModal.js`: `runPlanner` calls `saveDraftPlan` immediately after the pipeline completes. Plan is preserved even if the modal is force-closed by iOS.
- `handleApply` calls `clearDraftPlan` after writing to the trip. `handleDiscard` calls `clearDraftPlan` before calling `onClose`.

## Session — 31 May 2026 (continued — Part 4)

### ✨ UX Improvements

**Discard warning on Plan Ready close**
- `src/modals/AIPlannerModal.js`
- Swipe-down or hardware back in the ready phase now shows an `Alert.alert` — "Discard this plan? / Keep plan (cancel) · Discard (destructive)". `onClose` only fires on explicit "Discard" confirmation.
- Input/loading/error/applying phases still close immediately (no generated plan to lose).

**Price & availability disclaimer**
- `src/modals/AIPlannerModal.js`
- Blue info banner added below the summary (Activities / Per person / Group total) in the ready phase.
- Text: "Prices are estimates only and may vary at time of booking. Venue availability, opening hours, and hotel rates change — always confirm directly before committing."

## Session — 31 May 2026 (continued — Part 3)

### 🐛 Bug Fix

**JSON truncation on multi-day trips — "Unexpected end of input"**
- `src/agents/ItineraryAgent.js`, `src/utils/plannerAPI.js`
- Root cause: `max_tokens: 6000` (ItineraryAgent) and `max_tokens: 4096` (plannerAPI) were too low for 9-day trips. Math: 9 days × 5 activities × ~250 tokens/activity ≈ 11,250 tokens needed. Both limits cut the JSON mid-array, causing parse failure.
- Fix: Dynamic `max_tokens` scaled to trip length: `Math.min(60000, numDays * 1800 + 3000)`. Examples: 3 days → 8,400; 7 days → 15,600; 9 days → 19,200; 14 days → 28,200. Claude Haiku 4.5 supports 64k output — this uses it properly.
- The formula applies identically to both ItineraryAgent and plannerAPI (legacyFallback path).

## Session — 31 May 2026 (continued — Part 2)

### 🏗️ Architecture Change

**Cyclic plan modification workflow**
- `src/modals/AIPlannerModal.js`
- Previous: commands in the refinement bar called `callPlannerAPI` in-place (patching the current plan). This was unreliable — the patch had no access to fresh hotel/experience data, and Claude's prompt had limited context.
- New: commands in the refinement bar **accumulate into notes and trigger a full pipeline rebuild** (same as hitting "Generate" fresh). The cycle is: Ready → command typed → Loading (full pipeline) → Ready (updated plan).
- `runPlanner()` now accepts a `notesOverride` parameter to avoid React stale-state when called immediately after `setNotes()`.
- Questions still go to the answer bubble (instant, no API). Only plan modification commands trigger the cycle.
- Input phase now shows a blue "Modifying existing plan" banner when `dayActivities !== null`, with locked-field note (dates + location stay fixed).
- Notes field label changes to "YOUR CHANGES" when modifying.
- Generate button becomes "✏️ Rebuild Plan" (blue) when modifying vs "✨ Generate Plan" (purple) when fresh.
- Header "← Edit" renamed to "✏️ Modify" in the ready phase.
- Loading screen shows "Rebuilding with your changes…" vs "Building your itinerary…" based on whether prior refinements exist.

**What the agent can now handle cyclically (as long as dates/location unchanged):**
- Multi-city routing ("First 3 days in SD then LA")
- Hotel swaps ("Hotels under $150 per room")
- Venue-specific days ("Add Universal Studios Day 2")
- Pace/budget changes (via input chips)
- Meal additions, activity removals
- Any combination of the above — all instructions accumulate across cycles

## Session — 31 May 2026 (continued)

### 🐛 Bug Fixes

**Keyboard covering AIPlannerModal refinement bar**
- `src/modals/AIPlannerModal.js`
- Root cause: KAV was wrapping only the refine bar, not the plan ScrollView above it. When keyboard opened, the input lifted but the content didn't shrink, so the keyboard still covered the input area.
- Fix: Restructured so a single `KeyboardAvoidingView` (behavior `padding` on iOS, `height` on Android) wraps both the plan ScrollView and the refine bar — same pattern as AIChatModal. Removed the `height: 120` spacer; KAV handles the gap.

**Claude API 400 — credit balance exhausted**
- `src/agents/ItineraryAgent.js`, `src/utils/plannerAPI.js`
- Added full error body logging (`await res.json()`) and prompt size logging so errors are diagnosable.
- Root cause: Anthropic account credits were exhausted (confirmed from error body). Resolution: top up at console.anthropic.com → Plans & Billing.
- Prompt sizes confirmed healthy: ItineraryAgent 1,600 + 1,706 chars; plannerAPI 9,721 + 601 chars.

### ✨ New Features

**Intent router — questions vs plan commands**
- `src/modals/AIPlannerModal.js`
- Problem: typing "Can you handle multi city trips?" triggered a plan refinement ("Done — applied") instead of giving a real answer.
- Added `isQuestion(text)` — detects question starters (can/could/do/does/how/what/why/which/tell me/explain).
- Added `getQuestionAnswer(text, trip, plan)` — 7 contextual response patterns covering: multi-city routing, expense splitting, accessibility/wheelchair, hotels, day/activity counts, capability overview, and a graceful fallback prompting a rephrased command.
- Questions now show a `answerBubble` above the refine bar (yellow card, auto-dismisses in 10s, tap to close). Refinement history tracks questions as 💡 chips vs ✓ chips for plan changes.
- Plan modification commands continue to trigger the full pipeline refinement path unchanged.

**Agent workflow visualisation**
- Rendered in-session as SVG diagram showing all 6 agents, their parallel/sequential stages, data flows, and the new Intent Router layer.

## Session — 31 May 2026

### 🐛 Bug Fixes

**Keyboard covering AIChatModal**
- `src/modals/AIChatModal.js`
- Replaced `useKeyboardOffset` + `paddingBottom: kbOffset` approach with a `KeyboardAvoidingView` (behavior `padding` on iOS) wrapping the messages `ScrollView` + trial hint + input row. Header and chip bar remain fixed at top, unaffected by keyboard.

**Refinement not updating the plan**
- `src/utils/plannerAPI.js`
- Root cause: `currentPlan` (the existing `dayActivities`) was dropped when `callPlannerAPI` called `legacyFallback` — so Claude's `buildRefinementPrompt` got `null` for the current plan, and the no-API-key path regenerated from scratch every time.
- Fix 1: `currentPlan` now flows through `callPlannerAPI → legacyFallback → callClaudeAPI` so `buildRefinementPrompt` sees the actual scheduled activities.
- Fix 2: No-API-key refinement path now mutates the existing plan (`currentPlan.map(...)`) + applies note overrides instead of regenerating a fresh plan from scratch.

---

### ✨ New Features

**Google Places API integration — StayAgent**
- `src/agents/StayAgent.js`, `src/config.js`
- Replaced mock hotel database with live Google Places Text Search (New) API.
- Query is tailored to group: `"accessible hotels"` for wheelchair groups, `"family hotels"` for groups with kids, else `"hotels in {destination}"`.
- Maps `priceLevel → room rate`, `accessibilityOptions → wheelchairOk/strollerFriendly`, `formattedAddress → nearBeach`.
- Silent fallback to `MOCK_HOTELS[cityKey]` or `GENERIC_HOTELS` if API fails or returns no results.
- API key: `GOOGLE_PLACES_API_KEY` added to `config.js`.

**Google Places API integration — ExperienceAgent**
- `src/agents/ExperienceAgent.js`
- Replaced mock experience database with live Google Places Text Search (New) API.
- Fires 1–2 parallel queries: always `"top tourist attractions in {dest}"`, plus `"family activities for kids in {dest}"` when group has kids.
- Maps `types[]` → interest tags, `priceLevel` → cost per person, infers duration from type (zoo=4h, museum=2.5h, amusement_park=8h).
- Merges + deduplicates results by name before scoring.
- Silent fallback to `MOCK_EXPERIENCES[cityKey]` or `GENERIC_EXPERIENCES`.

---

### 📝 Documentation

**AGENTS.md — full rewrite**
- Updated to reflect current architecture (Phase 1 complete, Phase 2 planned).
- Added Phase 2 architecture: FastAPI backend + LangGraph pipeline + SQLite.
- Documented all bug fixes and conventions added this session.
- Added Phase 2 backlog table with priority order.

**CHANGELOG.md — created**
- This file. Tracks all changes session by session.

---

### 🗺️ Architecture Decisions

**iOS-first mobile strategy confirmed**
- VoyaraFresh (React Native + Expo) is the primary product.
- VoyaraWeb exists but is not the focus.
- Expo Go for development; EAS Build for TestFlight/App Store distribution (Phase 3).

**Phase 2 backend plan: FastAPI + LangGraph**
- Python FastAPI backend will host the agent pipeline server-side.
- LangGraph replaces `pipeline.js` — adds streaming, checkpointing, human-in-the-loop, per-node retry.
- SQLite for persistence; PostgreSQL for production.
- WebSocket / SSE for real-time agent progress streaming to the mobile app.
- API keys (Claude, Google Places, Gemini) move off device to backend.
- **Decision: not building this yet** — testing AI Planner workflow first with current client-side setup. Database/backend added when cross-device sync or App Store submission becomes the priority.

---

## Backlog / Next Sessions

- [ ] Debug overlay — in-app panel showing agent run results + API hit/miss
- [ ] Real-time streaming agent progress UI in AIPlannerModal
- [ ] FastAPI backend scaffold (Python + LangGraph)
- [ ] Google Routes API in TransitAgent (real drive/transit times)
- [ ] EAS Build setup → TestFlight
- [ ] Fix dangling `paidBy` after member delete (known bug)
