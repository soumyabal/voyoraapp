# Kithova — Engine ↔ UI Contract

> **For the UX revamp.** This is the stable surface the (new or restyled) UI builds against. Redesign
> the presentation however you like — but **call these functions; never reimplement their logic.** The
> engine is decoupled, headless (`testEnvironment: node`), and gated by ~848 tests + golden snapshots.
>
> **The one rule:** a UX change is `screens / modals / components / theme` only. The engine files are
> off-limits. Run `npm run ux:guard` before every commit — it **fails** if you touch the engine, then
> runs the full suite. (A genuine engine change is fine — but it's its own tripwired commit, never
> bundled into UI work.) See [[change-safety-discipline]] in AGENTS.md.

---

## 0. Mental model

```
        ┌─────────────────────── UI (yours to redesign) ───────────────────────┐
        │  screens/  modals/  components/  theme.js                              │
        │      │  calls (read)            │  calls (write)                       │
        ▼      ▼                          ▼                                      │
   ┌─ pure engine (src/utils/*) ─┐   ┌─ store actions (src/store) ─┐            │
   │ validateTrip, planDay,       │   │ createTrip, addActivity,    │            │
   │ travelLeg, calcSettlements…  │   │ toggleFamilySplit…          │            │
   └──────────────────────────────┘   └─────────────────────────────┘            │
        returns DATA (warnings,            mutates the persisted Zustand store     │
        drafts, numbers, shapes)           (the UI re-renders reactively)          │
        └───────────────────────────────────────────────────────────────────────┘
```

The UI **renders data the engine returns** and **calls store actions to write**. It decides *nothing* about
rules, placement, or money — those live in the engine.

---

## 1. Read API — pure functions (import from `src/utils/*`)

### Trip Check (`tripValidator.js`)
| Call | Returns | Use in UI |
|---|---|---|
| `validateTrip(trip)` | `Warning[]` | the whole checker — render per-day pills / a review screen |
| `groupWarningsByDay(warnings, trip)` | `{ [dayIndex|'trip']: Warning[] }` | group for the Trip Check screen |
| `summariseWarnings(warnings)` | `{error,warning,info}` counts | the trip-health badge |
| `estimateDuration(activity, prevStop?)` | minutes | show "~2h", feed timelines |
| `lodgingForNight(trip, dayIndex)` | `{stay, nights, nightNumber, isLastNight, overnightTransit}` \| `null` | the "Night N of M" footer |
| `dayStartAnchor / dayEndAnchor / dayRouteAnchor(trip, i)` | `{lat,lng,label}` | route start/finish, maps |

**`Warning` shape** (render this, don't invent it): `{ type, severity:'error'|'warning'|'info', icon, title, message, hint, dayIndex, actIds[], suggestedTime?, moveActId?, verifyUrl? }`.

### Planning / arrange (`autoArrange.js`)
| Call | Returns | Use |
|---|---|---|
| `planDay(activities, opts)` | `{ scheduled, changed, changes[], overflow[], unresolved[] }` | "✨ Plan my day" — preview `changes`, write `scheduled` |
| `scheduleDay(activities, opts)` | re-timed copies | lower-level placer (planDay wraps it) |
| `autoArrange(basket, …)` | day drafts | basket → days |
| `returnJourneyDraft(trip)` | a transport draft \| `null` | the "Heading home?" card |
| `suggestDayForVenue(trip, venue, opts)` | `{best, …}` | "move to Day N" |
| `smartCheckoutTime(nominal, acts)` | `'HH:MM'` | place the check-out before departures |

`opts` ≈ `{ dayRole, date, anchor, endAnchor, pace, families, origin, checkout?, earliestMin }`. **`planDay` is pure — it returns a preview; the UI applies it** (so undo/preview stays the UI's job).

### Geo / time (`geo.js`, `helpers.js`, `tz.js`, `hours.js`)
| Call | Returns |
|---|---|
| `travelLeg(a, b)` | `{ km, min, mode:'walk'|'drive' }` \| `null` |
| `formatMi(km)` / `haversineKm(a,b)` | display string / km |
| `resolveDayZones(trip, dayIndex)` | per-stop zone labels |
| `crossZoneLeg(trip, dayIndex, act)` | the cross-zone eyebrow (depart→arrive zones) |
| `isDayInPast / planFloorMin / isTripOngoing(trip, i?, nowMs)` | clock-aware flags |
| `dayNeedsExpenseLog(trip, dayIndex, nowMs)` | bool — the "log expenses" nudge |
| `dayIntervals / isOpenAt / hoursLabel(openHours, weekday)` | opening-hours model |
| `googleMapsDayUrl(trip, dayIndex)` (`mapsRoute.js`) | a maps route URL |

### Money — the moat (`costs.js`, `expenses.js`)
**Never compute a split in a component — always call these.**
| Call | Returns |
|---|---|
| `calcBalances(trip)` / `calcFamilyBalances(trip)` | per-person / per-family paid-vs-share balances |
| `calcSettlements(balances)` | `[{from,to,amount}]` — "who pays whom" |
| `getExpSplitBetween(exp, trip)` | member ids sharing an expense |
| `famExpenseShare(fam, exp, trip)` / `memberExpenseShare(member, exp, trip)` | a family's / member's share |
| `calcTripItineraryTotal / calcDayCostForTrip / calcFamilyItineraryCost(...)` | totals for headers |
| `rebuildItineraryExpenses(trip)` / `activityToExpense(act, trip)` (`expenses.js`) | itinerary → expense linkage |

### Magic Paste & AI (`itineraryImport.js`, `plannerAPI.js`)
| Call | Returns / note |
|---|---|
| `importTripFromText(store, text, opts)` | sync (rules parser) → `{trip, summary}` |
| `importTripFromTextAsync(store, text, opts)` | async (AI extract → assemble); `opts.extract` injectable |
| `callPlannerAPI(trip, travelers, options, onProgress, …)` | the 6-agent AI plan pipeline |

---

## 2. Write API — store actions (`useStore()` from `src/store`)

The UI **never mutates trip data directly** — it calls actions; the store is persisted + versioned.

| Action | Effect |
|---|---|
| `createTrip(params)` | builds trip + families + days |
| `applyPlannedActivities(tripId, dayActivities)` | writes activities + auto-expenses (if `._budget`) |
| `addActivity / updateActivity / deleteActivity(...)` | activity CRUD (+ linked-expense sync) |
| `reorderSlotActivities / moveActivity / setDayActivities(...)` | ordering / day moves / apply a plan |
| `resizeTripDates(tripId, start, end)` | **the only** way to change the date range (never raw `updateTrip` on `days`) |
| `toggleFamilySplit / updateExpensePayer / toggleExpenseExcluded(...)` | expense participation / payer |
| `addExpense / updateExpense / deleteExpense(...)` | manual expenses |
| `ignoreWarning(tripId, key)` | dismiss a Trip Check / nudge (e.g. `expense_log:<date>`) |

---

## 3. Data shapes (read-only reference — see AGENTS.md "Key Data Schemas" for full)

`Trip { id, name, destination, startDate, endDate, mode, pace, budget, splitMode, families[], days[], expenses[], origin?, ignoredWarnings[] }`
`Family { id, name, color, members[] }` · `Member { id, travelerId, name, age, needs[], dietary, interests }`
`Activity { id, type:'transport'|'stay'|'food'|'activity', subtype?, time, arriveTime?, name, costPerPerson, lat, lng, openHours?, status?, checkout? }`
`Expense { id, name, amount, estimatedAmount, category, paidBy, splitMode, participatingFamilies[], participatingMembers?|null, excluded, source?, activityId?, familyId? }`

---

## 4. Invariants the UI must not break (these are how the moat stays correct)

1. **`participatingFamilies` is the source of truth** for a split — read it via `getExpSplitBetween(exp, trip)`.
2. **`estimatedAmount` is frozen** — only ever update `amount`.
3. **`costPerPerson` is always per-person** — all cost math multiplies by member count.
4. **At least one family** always participates in an expense.
5. **Date-range changes go through `resizeTripDates`** — `updateTrip` never touches `days[]`.
6. **Use `effectiveMember(member, travelers)`** — never read `tripMember.dietary` directly.
7. **Persisted shape is versioned** — any change to the saved shape bumps `version` + adds a `migrate` case (this is an *engine* change, not UI — keep it out of UI commits).
8. **Lodging is modeled once** (one check-in `stay` carries `nights`); use `lodgingForNight()`.

---

## 5. What's freely redesignable vs. locked

| ✅ Redesign freely | 🔒 Locked (this contract) |
|---|---|
| `screens/`, `modals/`, `components/`, `theme.js` | the engine **function names + return shapes** above |
| layout, nav model, color, type, motion, IA | the **store actions** + the **8 invariants** |
| where/how Trip Check, Plan-my-day, Split are surfaced | the **persisted store shape** (versioned) |
| new screens, rails, sheets, onboarding flows | the rule/money modules: `tripValidator`, `autoArrange`, `costs`, `expenses`, `geo`, `hours`, `tz`, `slots`, `store/` |

---

## 6. The workflow (every increment)

1. Touch **UI only**.
2. `npm run ux:guard` → fails if an engine file changed, then runs all tests + snapshots.
3. Compile-net (`npx jest screensCompile`) + `npx eslint <changed>`.
4. Small commit + push. **UI is unverified until device-checked** — say so.
5. Gate red → stop or revert.

> Design reference: the approved direction lives in `prototypes/discover-rails.html` (Lambus-style rails,
> two-level nav: app tabs `Trips/Discover/Updates/Profile` + in-trip `Itinerary/People/Split`).
