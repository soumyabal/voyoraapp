# UX Revamp — Progress & How to Test

> Autonomous build log for the Lambus-style revamp. Everything is **behind a flag, default OFF** —
> the current app is unchanged until you flip it. Calls the engine, never reimplements it.
> Design ref: `prototypes/discover-rails.html` · API: `docs/ux-engine-contract.md` · Guard: `npm run ux:guard`.

## ✅ Built so far (flag-gated, `ux:guard`-green, device-UNVERIFIED)

| Piece | File | What it is |
|---|---|---|
| Flag | `RELEASE_FLAGS.newShell` (in `src/config.js`, default **false**) | the on/off switch |
| App shell | `src/screens/MainShell.js` | custom bottom tab bar — **Trips · Discover · Updates · Profile** (no nav lib; state-based; Expo-Go-safe; tabs kept mounted). Tabs carry a11y roles/labels + 44pt targets |
| Trips | `src/screens/ShellTripsScreen.js` | **themed** trip list grouped **Active / Upcoming / Past** via the pure `groupTrips` engine helper; Magic Paste + New Trip entry points; status pill; long-press → Mark complete / Delete; first-trip empty state |
| Discover | `src/screens/DiscoverScreen.js` | hero "Trip of the Week" + rails (Popular Categories · Start your trip · Made for groups). Onboarding wired to the **real** `PasteImportModal` + `NewTripModal`; not-yet-built cards are honest `showToast` placeholders |
| Updates | `src/screens/UpdatesScreen.js` | **engine-driven** feed — expense-log nudges (`dayNeedsExpenseLog`) **+ lifecycle reminders** (`buildUpdates`: post-trip settle-up, trip-starting-soon) + a trips list |
| Profile | `src/screens/ProfileScreen.js` | **Appearance** toggle (System/Light/Dark) + stat strip (trips · people · groups) + saved families/groups (with "N trips together") + the traveler library; tapping a person opens the **real** `AddProfileModal` to edit, "+ Add person" opens it fresh |
| **Theme (light/dark)** | `src/shellTheme.js` + `src/utils/themeMode.js` | a LOCAL light/dark palette for the new shell ONLY — dark values ported from the prototype's `:root`. Mode **System / Light / Dark**, **persisted to AsyncStorage** (no store-schema bump), default follows the OS. Does **not** touch the light-only main app |
| Engine helpers (pure, tested) | `utils/tripGrouping.js` · `utils/groupStats.js` · `utils/shellUpdates.js` · `utils/themeMode.js` | the new-shell screens' logic, extracted RN-free and unit-tested (see counts below) |
| Routing | `src/navigation/AppNavigator.js` | `Home → MainShell` only when the flag is on; **TripScreen (Itinerary/People/Split) is reused as-is** |

**All four tabs are now themed (dark-capable).** The legacy `HomeScreen` is untouched and still serves
the **flag-OFF** app. Trip detail is the current `TripScreen` (untouched) — the new *Itinerary look*
from the prototype is a later, separate step (see Next).

## ▶️ How to turn it on (30 seconds)

1. In `src/config.js`, set `newShell: true` inside `RELEASE_FLAGS`. *(`src/config.js` is gitignored — never commit it. It is currently **true** on this machine after your last session.)*
2. Reload the app (Expo: press `r`, or `npx expo start -c` if a new file isn't picked up). It opens on the new **Discover**.
3. To turn it back off: set it to `false` and reload.

## 👀 What to device-check (everything below is built but UNVERIFIED on device)

- **Bottom tab bar** — switches Trips/Discover/Updates/Profile; active tab is terracotta; all content clears the floating bar.
- **Dark mode** — Profile → **Appearance → Dark** recolors **all four tabs** + the tab bar (surfaces, text, hairlines, status-bar icons). The choice now **persists across reloads**. Image-gradient cards (hero/categories) keep their colors by design. Check contrast + that terracotta still reads on dark.
- **Trips tab** — groups Active / Next / Upcoming / Past correctly; status pills right; **New** opens the create flow; **Magic Paste** opens the importer; **long-press a trip** → Mark complete / Delete works; empty state shows when there are no trips.
- **Discover** — hero + three rails scroll sideways; **"Paste a plan"** / **"Group trip"** build a trip and jump into it; other cards show "… coming soon".
- **Updates** — ongoing trip with an unlogged wrapped day → "Log … spend"; an **ended** trip with spend → **"Settle up"**; a trip **starting within 3 days** → "starting soon". Each opens the trip.
- **Profile** — stat counts correct; group cards show member count + "N trips together"; tap a person → edit sheet; "+ Add person" adds one.
- **Default app unaffected** when the flag is off.

## 🔜 Next (when you're back / with feedback)

- **The new Itinerary look** (prototype centerpiece) as a *flagged TripScreen variant* — **deliberately deferred**: `TripScreen` is shared with the live app and look-and-feel is device-gated, so it's best done **together** (I build, you verify in the same session) rather than blind. This is the main remaining prototype-fidelity gap.
- **"Settle up" → open the Split tab directly** (today the Updates settle card opens the trip to Itinerary; deep-linking to Split needs a small nav param on `TripScreen`).
- **"Start a trip with this group"** from a Profile group card — needs a create-with-group seed path (NewTripModal preselect); left for a device session.
- Wire **"Templates" / curated trips** to a real seed-a-trip path (Discover rails are placeholders today).
- Persist the chosen **app tab** + optionally migrate the theme choice into the store if you ever want it server-synced.

## 🤖 Autonomous session log (owner offline)

Shipped as small, individually-revertible commits — each green on `ux:guard` (engine-touch guard +
full suite) + compile-net + eslint, `src/config.js` never staged:

1. `feat(ux): real Profile tab …` — library/groups overview + edit
2. `feat(ux): dark theme for the new shell …` — local light/dark palette, main app untouched
3. `feat(ux): persist new-shell theme choice + extract tested resolveTheme` — AsyncStorage + 6 tests
4. `feat(ux): native themed Trips tab …` — `groupTrips` + 8 tests; retires the light HomeScreen in-shell
5. `feat(ux): Profile group cards show "N trips together"` — `groupStats` + 3 tests
6. `polish(ux): accessibility + 44pt targets on the new-shell tab bar`
7. `feat(ux): lifecycle reminders in the Updates feed …` — `buildUpdates` + 7 tests

## How each step stayed safe

Every commit: UI/util files only → `npm run ux:guard` (fails on any engine touch, then runs the full
suite) → compile-net + eslint → small commit. The engine (`tripValidator`, `autoArrange`, `costs`,
`expenses`, …) was never touched. New pure logic is unit-tested (24 new tests this session across
`themeMode` ·6, `tripGrouping` ·8, `groupStats` ·3, `shellUpdates` ·7). Suite: **851 → 877 tests +
28 snapshots green** throughout.
