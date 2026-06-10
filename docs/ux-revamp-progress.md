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
| **Trip detail** | `src/screens/TripShellScreen.js` (route `TripShell`) | the prototype's two-level in-trip nav: flat themed header (back · emoji · name · dest/dates · status/mode/families pills · ⋮ menu) + segmented **Itinerary / People / Split** subtabs + Trip Check. **Bodies REUSE the existing `ItineraryScreen`/`TravelersScreen`/`SplitwiseScreen`** — engine + split moat never reimplemented. Isolated route; classic `Trip`/`TripScreen` untouched |
| **Theme (light/dark)** | `src/shellTheme.js` + `src/utils/themeMode.js` | a LOCAL light/dark palette for the new shell ONLY — dark values ported from the prototype's `:root`. Mode **System / Light / Dark**, **persisted to AsyncStorage** (no store-schema bump), default follows the OS. Does **not** touch the light-only main app |
| Engine helpers (pure, tested) | `utils/tripGrouping.js` · `utils/groupStats.js` · `utils/shellUpdates.js` · `utils/themeMode.js` | the new-shell screens' logic, extracted RN-free and unit-tested (see counts below) |
| Routing | `src/navigation/AppNavigator.js` | `Home → MainShell` only when the flag is on; **TripScreen (Itinerary/People/Split) is reused as-is** |

**All four tabs are now themed (dark-capable).** The legacy `HomeScreen` + classic `TripScreen` are
untouched and still serve the **flag-OFF** app. The new in-trip **nav/header is ported** (TripShell);
the prototype's new Itinerary **card** look (day rail · slots · accent-stripe cards) is the remaining
fidelity gap — deliberately left for an on-device session (see Next).

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
- **Trip detail (NEW)** — opening any trip from the shell lands on `TripShell`: flat themed header, **Itinerary / People / Split** segmented tabs all work, ⋮ menu (Edit/Duplicate/Share/Export/Delete), Trip Check opens. **Known:** the tab *bodies* are the existing screens, so in **dark** mode the header is dark but the body is light until those are restyled. Verify nothing regressed vs the classic trip screen (it's the same inner screens, new chrome).
- **Default app unaffected** when the flag is off (classic Home + Trip screens).

## 🔜 Next (when you're back / with feedback)

- **The new Itinerary CARD look** (day rail · slot headers · accent-stripe cards · travel legs · lodging footer · per-day actions) — the in-trip *nav* is now ported (TripShell), but the Itinerary tab still renders the existing card design. Restyling it means reimplementing the app's most engine-dense screen (`ItineraryScreen`), so it's **best done together on-device** (I build the skin over the existing data/engine entry points; you verify) rather than blind. This is the main remaining prototype-fidelity gap. Doing this would also resolve the dark-mode "dark header / light body" inconsistency for the Itinerary tab.
- **Restyle the People / Split bodies** for dark cohesion (same dark-header/light-body note) — careful work since Split is the moat UI; reuse the engine, re-skin only.
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
8. `feat(ux): new-shell trip detail …` — TripShell route: flat themed header + segmented subtabs, reusing the existing Itinerary/People/Split screens (engine + moat untouched)

## How each step stayed safe

Every commit: UI/util files only → `npm run ux:guard` (fails on any engine touch, then runs the full
suite) → compile-net + eslint → small commit. The engine (`tripValidator`, `autoArrange`, `costs`,
`expenses`, …) was never touched, and no existing screen's logic was reimplemented (TripShell
*reuses* the real Itinerary/People/Split screens). New pure logic is unit-tested (24 new tests this
session across `themeMode` ·6, `tripGrouping` ·8, `groupStats` ·3, `shellUpdates` ·7). Suite:
**851 → 878 tests + 28 snapshots green** throughout.
