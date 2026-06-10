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
| Profile | `src/screens/ProfileScreen.js` | stat strip (trips · people · groups) + saved families/groups + the traveler library; tapping a person opens the **real** `AddProfileModal` to edit, "+ Add person" opens it fresh. Read-only otherwise; accounts stay off. Hosts the **Appearance** toggle |
| **Dark theme** | `src/shellTheme.js` (`ShellThemeProvider` / `useShellTheme`) | a LOCAL light/dark palette for the new shell ONLY — dark values ported from the prototype's `:root`. Mode = **System / Light / Dark** (toggle on Profile; default follows the OS). Does **not** touch the light-only main app; the Trips tab is the existing HomeScreen and stays light |
| Routing | `src/navigation/AppNavigator.js` | `Home → MainShell` only when the flag is on; **TripScreen (Itinerary/People/Split) is reused as-is** |

**Trips** tab = the existing `HomeScreen`. Trip detail is the current TripScreen (untouched) — the
new *Itinerary look* from the prototype is a later, separate step.

## ▶️ How to turn it on (30 seconds)

1. In `src/config.js`, set `newShell: true` inside `RELEASE_FLAGS`. *(It's already present + false on this machine. `src/config.js` is gitignored — never commit it.)*
2. Reload the app (Expo: press `r`, or shake → Reload). It opens on the new **Discover**.
3. To turn it back off: set it to `false` and reload.

## 👀 What to device-check

- **Bottom tab bar** — switches Trips/Discover/Updates/Profile; active tab is terracotta.
- **⚠️ Known suspect:** the **Trips** tab is the old HomeScreen, which has its own bottom CTA — it may sit **under the floating tab bar**. If so, that's a padding fix (tell me; I'll add bottom inset to the shell's content).
- **Discover** — hero + the three rails scroll sideways; **"Paste a plan"** opens Magic Paste, **"Group trip"** opens the create flow; both should build a trip and jump into it. Other cards show "… coming soon".
- **Updates** — on an *ongoing* trip with an unlogged wrapped day, a "Log … spend" nudge appears and opens the trip.
- **Profile** — stat strip reads real counts; saved groups show a colored dot + member count; tapping a person opens the edit sheet and "+ Add person" adds one (both write through the existing library). Cards should clear the floating tab bar.
- **Dark theme** — the **Appearance** toggle at the top of Profile flips System/Light/Dark; **Dark** instantly recolors Discover · Updates · Profile · the tab bar (surfaces, text, hairlines, status-bar icons). **Known:** the **Trips** tab is the existing light HomeScreen — it stays light in dark mode (out of scope for the shell palette). Image-gradient cards keep their colors in both modes.
- **Default app unaffected** when the flag is off.

## 🔜 Next (when you're back / with feedback)

- Padding pass so HomeScreen clears the tab bar (after you confirm the collision).
- The new **Itinerary look** (prototype style) as a *flagged TripScreen variant* — bigger, device-gated, best done together since TripScreen is shared with the live app.
- Profile follow-ups: surface saved trips per group, and a one-tap "start a trip with this group" (reuse `AddGroupToTripModal`'s path).
- Wire "Templates" / curated trips to a real seed-a-trip path.

## How each step stayed safe

Every commit: UI files only → `npm run ux:guard` (fails on any engine touch, then runs the full
suite) → compile-net + eslint → small commit. The engine (`tripValidator`, `autoArrange`, `costs`,
`expenses`, …) was never touched; **851 tests + 28 snapshots green** throughout.
