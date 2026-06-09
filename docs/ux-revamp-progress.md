# UX Revamp — Progress & How to Test

> Autonomous build log for the Lambus-style revamp. Everything is **behind a flag, default OFF** —
> the current app is unchanged until you flip it. Calls the engine, never reimplements it.
> Design ref: `prototypes/discover-rails.html` · API: `docs/ux-engine-contract.md` · Guard: `npm run ux:guard`.

## ✅ Built so far (flag-gated, `ux:guard`-green, device-UNVERIFIED)

| Piece | File | What it is |
|---|---|---|
| Flag | `RELEASE_FLAGS.newShell` (in `src/config.js`, default **false**) | the on/off switch |
| App shell | `src/screens/MainShell.js` | custom bottom tab bar — **Trips · Discover · Updates · Profile** (no nav lib; state-based; Expo-Go-safe; tabs kept mounted) |
| Discover | `src/screens/DiscoverScreen.js` | hero "Trip of the Week" + rails (Popular Categories · Start your trip · Made for groups). Onboarding wired to the **real** `PasteImportModal` + `NewTripModal`; not-yet-built cards are honest `showToast` placeholders |
| Updates | `src/screens/UpdatesScreen.js` | **engine-driven** feed — "log expenses" nudges via `dayNeedsExpenseLog` + a trips list |
| Routing | `src/navigation/AppNavigator.js` | `Home → MainShell` only when the flag is on; **TripScreen (Itinerary/People/Split) is reused as-is** |

**Trips** tab = the existing `HomeScreen`. **Profile** = a placeholder for now. Trip detail is the
current TripScreen (untouched) — the new *Itinerary look* from the prototype is a later, separate step.

## ▶️ How to turn it on (30 seconds)

1. In `src/config.js`, set `newShell: true` inside `RELEASE_FLAGS`. *(It's already present + false on this machine. `src/config.js` is gitignored — never commit it.)*
2. Reload the app (Expo: press `r`, or shake → Reload). It opens on the new **Discover**.
3. To turn it back off: set it to `false` and reload.

## 👀 What to device-check

- **Bottom tab bar** — switches Trips/Discover/Updates/Profile; active tab is terracotta.
- **⚠️ Known suspect:** the **Trips** tab is the old HomeScreen, which has its own bottom CTA — it may sit **under the floating tab bar**. If so, that's a padding fix (tell me; I'll add bottom inset to the shell's content).
- **Discover** — hero + the three rails scroll sideways; **"Paste a plan"** opens Magic Paste, **"Group trip"** opens the create flow; both should build a trip and jump into it. Other cards show "… coming soon".
- **Updates** — on an *ongoing* trip with an unlogged wrapped day, a "Log … spend" nudge appears and opens the trip.
- **Default app unaffected** when the flag is off.

## 🔜 Next (when you're back / with feedback)

- Padding pass so HomeScreen clears the tab bar (after you confirm the collision).
- A real **Profile** tab (traveler library / families).
- The new **Itinerary look** (prototype style) as a *flagged TripScreen variant* — bigger, device-gated, best done together since TripScreen is shared with the live app.
- Wire "Templates" / curated trips to a real seed-a-trip path.

## How each step stayed safe

Every commit: UI files only → `npm run ux:guard` (fails on any engine touch, then runs the full
suite) → compile-net + eslint → small commit. The engine (`tripValidator`, `autoArrange`, `costs`,
`expenses`, …) was never touched; **851 tests + 28 snapshots green** throughout.
