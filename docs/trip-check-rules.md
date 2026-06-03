# Trip-Check — the complete rule catalog (web-sourced)

> Validation rules for the Trip-Check engine (`src/utils/tripValidator.js`),
> grounded in published travel-planning guidance, not guesswork. Each rule is a
> small, pure, unit-testable check. **Severity discipline (anti-nag):** `error`
> = will break the day; `warning` = likely problem; `info` = FYI (dismissible,
> NOT counted in the headline badge). Over-warning is the failure mode.
>
> Status: ✅ exists today · 🆕 new (add) · 🔶 new, needs a data field we don't persist yet.

---

## What the research established (the heuristics behind the rules)

- **One to two *main* activities per day** — anchor only arrival, accommodation,
  and one key activity; add more only if time/energy allow. Over-scheduling →
  "vacation burnout." The "**3-3-3 rule**": ~3 attractions, 3 local meals, 3
  spontaneous moments/day.
- **Buffers are not waste** — keep **≥30% of each day unscheduled**, plus a
  buffer at the end of each day and *between* activities (meals, walking, lines,
  photos, transit, the unexpected).
- **Pace the trip** — on longer trips build a **rest day around day 4** (when
  fatigue hits); on a weekend put the **heavy anchor on day 1** (energy highest),
  slower day 2. **Group anchors by area** so you don't crisscross.
- **Arrival/first day** — don't plan much on arrival day: getting to the hotel,
  dropping bags, orienting (and jet lag) costs **2–3h minimum**.
- **Multi-city** — **≥2 nights per city** (3 for major/when flying); too many
  cities for the days is the #1 mistake (5 cities/10 days ≈ 5 transit days).
- **Family / elderly / kids** — **one main activity/day**, scheduled late
  morning/early afternoon (peak energy), with downtime to rest; **verify
  accessibility per venue** (hotel, show, restaurant), not once.

Sources at the bottom.

---

## A. Pacing & load (per day)

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `packed` | warning | ≥8 substantial activities/day | have |
| 🆕 | `ambitious_day` | info | substantial activities > pace cap (relaxed>3 / moderate>4 / packed>6) but <8 | have (`trip.pace`) |
| 🆕 | `no_breathing_room` | info | a day where every consecutive pair is back-to-back (<15 min between) for ≥3 items | have (times + durations) |
| 🆕 | `over_scheduled_minutes` | info | sum of activity-minutes > ~70% of the active window (i.e. <30% unscheduled) | have |

*Why:* 1–2 anchors/day; ≥30% unscheduled; buffer between activities.

## B. Day shape — slots & gaps (the owner's empty-morning ask)

| # | id | sev | condition | data |
|---|---|---|---|---|
| 🆕 | `open_slot_morning` | info | active day, nothing before ~12:00, not arrival/departure | have (slots.js) |
| 🆕 | `open_slot_evening` | info | active day, nothing after ~17:00 | have |
| 🆕 | `large_idle_gap` | warning | gap ≥ 180 min between consecutive items, not bridged by a meal/travel | have |
| ✅ | `empty_day` | warning (interior) / info (edge) | day has nothing | have |
| ✅ | `notes_only_day` | info | notes but no real activities | have |

## C. Arrival / departure / first day

| # | id | sev | condition | data |
|---|---|---|---|---|
| 🆕 | `arrival_day_overpacked` | warning | day 0 has ≥3 substantial activities **or** a full-day venue | have |
| 🆕 | `day1_missing_arrival` | info | day 0 active but no inbound `transport` and no `stay` check-in | have |
| 🆕 | `departure_day_overpacked` | info | last day has ≥3 substantial activities | have |
| 🆕 | `lastday_missing_checkout` | info | trip has a stay but no checkout on the final day | have |

*Why:* arrival/departure overhead (2–3h) + jet lag.

## D. Lodging / check-in–out

| # | id | sev | condition | data |
|---|---|---|---|---|
| 🆕 | `checkin_too_early` | warning | a `stay` scheduled before ~14:00 (also catches the auto-arrange hotel-in-the-morning bug) | have |
| 🆕 | `hotel_no_checkin` | info | trip has lodging activities but none typed as a check-in | have |
| 🔶 | `unbooked_night` | warning | an interior night with no `stay` and not the traveler's home base | needs a per-night lodging model |

## E. Multi-city & geography

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `multi_city_day` | warning | ≥2 cities tagged on one day (non-transport) | have (`activity.city`) |
| 🆕 | `min_nights_per_city` | info | a city that gets only 1 day across the whole trip | have |
| 🆕 | `too_many_cities` | info | distinct cities > ceil(days / 2) | have |
| 🆕 | `city_revisit` | info | same city appears on non-consecutive days (you leave and come back) | have |

*Why:* ≥2 nights/city; don't crisscross; too-many-cities is the top mistake.

## F. Meals

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `no_meal` | info | ≥4h active day, ≥3 activities, no food stop | have |
| 🆕 | `long_meal_gap` | info | >6h between consecutive meals (or first meal after ~14:00) on an active day | have |

## G. Travel logistics

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `overlap` | error (≥90m) / warning | next item starts before previous est. end | have |
| ✅ | `long_journey_conflict` | error | ≥6h transport + other activities same day | have |
| 🆕 | `back_to_back_long_travel` | warning | two consecutive days each with a ≥6h transport | have |
| 🆕 | `tight_connection` | info | a time-sensitive activity within <60 min of a transport arrival | needs `arriveTime` (sometimes present) |

## H. Timing & opening-hours (no external data — uses `day.date`)

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `past_midnight` | info | last item ends after 24:00 | have |
| ✅ | `early_start` | info | first non-transport item before 06:00 | have |
| ✅ | `wake_time` | warning/info | activity before family wake time | have |
| ✅ | `multi_day_journey` | info | transport `arriveTime` < `time` | have |
| 🆕 | `monday_closure_risk` | info | a museum/gallery on a **Monday** ("many close Mondays — verify") | have (`day.date`) |
| 🆕 | `sunday_closure_risk` | info | shops/markets on a **Sunday** (region-dependent) | have |

## I. Group · accessibility · dietary (the wedge)

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `dietary_conflict` | warning | meat/alcohol keyword vs veg/no-alcohol family | have |
| 🔶 | `accessibility_conflict` | warning | a `♿ Wheelchair` member + an activity known to be wheelchair-inaccessible | `wheelchairOk` is fetched at Discover but **dropped on save** — one-line schema add to persist it |
| 🆕 | `strenuous_for_group` | info | hike/trek/long-walk/steep activity with an elder (65+) or infant in the group | have (member ages + keyword) |
| 🆕 | `elder_packed_day` | info | a day over the pace cap when an elder/infant is travelling ("one main activity/day, build in rest") | have |

## J. Data hygiene

| # | id | sev | condition | data |
|---|---|---|---|---|
| ✅ | `duplicate_activity` | warning | same place added twice in a day | have |

---

## Long-trip tuning (ties to 21-day support)

On trips ≥14 days these rules would flood the user, so:
- **Collapse repeated infos** into one summary ("5 days have open mornings — auto-fill?") deep-linking to whole-trip auto-fill.
- **Add `no_rest_day` (info)** for trips ≥7 days with no light/rest day near day 4 (research: rest day ≈ day 4). Suppressed once a noted rest day exists.
- Downgrade interior `empty_day` to info on long trips (flex days are legitimate).

## Implementation notes
- Most NEW rules are **info** by design (helpful, dismissible). Only
  `large_idle_gap`, `arrival_day_overpacked`, `checkin_too_early`,
  `back_to_back_long_travel`, and `accessibility_conflict` are warnings.
- Headline badge counts **errors + warnings only** (`summariseWarnings`,
  `tripValidator.js:548`).
- Recommended structure: refactor the per-day checks into a **named rule
  registry** `[{ id, severity, scope:'day'|'trip', test }]` so each rule is
  independently unit-testable and the catalog above maps 1:1 to code.
- Two rules need a tiny data add: `accessibility_conflict` (persist
  `wheelchairOk` onto the activity at `DiscoverModal.js` `handleConfirmAdd`) and
  `unbooked_night` (a per-night lodging model — defer).

---

### Sources
- [The Everygirl — itinerary planning (3-3-3, rest day ~day 4, group by area, buffers)](https://theeverygirl.com/travel-itinerary-planning-tips/)
- [Green Travellist — travel buffers / ≥30% unscheduled](https://greentravellist.com/sustainable-travel-tips/travel-buffers-reduce-stress/)
- [Daily Dream Travel — signs you're overplanning](https://www.dailydreamtravel.com/overplanning-a-trip/)
- [Wonder & Sundry — keep the itinerary loose (time for meals/lines/rest)](https://wonderandsundry.com/how-to-keep-your-travel-itinerary-loose-and-have-an-incredible-vacation/)
- [Get Out of Town — common itinerary mistakes](https://www.wegetoutoftown.com/tips/itinerary-mistakes)
- [Aliki Travel — multi-city mistakes (arrival overhead, too many cities)](https://www.alikitravelblog.com/post/travel-planning-mistakes-that-often-ruin-multi-city-trips)
- [Yopki — multi-city planner (min nights per city)](https://yopki.com/guides/multi-city-trip-planner/)
- [AARP — planning a trip with an older parent (one activity/day, downtime)](https://www.aarp.org/travel/travel-tips/safety/vacationing-with-older-adults/)
- [Road Scholar — travel tips with elderly parents (accessibility per venue)](https://www.roadscholar.org/blog/essential-travel-tips-for-traveling-with-elderly-parents/)
- [Afar — family trip with kids and older parents](https://www.afar.com/magazine/tips-to-enjoying-a-family-trip)

*Voyara · Trip-Check rule catalog · June 2026.*
