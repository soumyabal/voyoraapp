# Business Model & Cost Strategy — "free for most, monetize bookings"

> Response to: "the numbers are scary — I want the app free for most, charge for the AI part, and
> earn from bookings + ads." Honest analysis: is it viable, and how. Estimates from training-data
> knowledge (no web calls); verify affiliate/ad rates live before relying.

---

## 0. TL;DR
1. **The cost isn't AI — it's Google Places.** And it's the *most reducible* cost you have.
2. **Free-for-most is viable** once you swap the expensive data source on the free tier + cache
   server-side + use free photos → free-user cost drops from **~$1.50 → a few cents**.
3. **Booking affiliate is the real revenue** (group trips = big baskets) — it dwarfs the cost.
4. **Charging for AI alone is weak** (AI is cheap + free substitutes exist) → make AI a *Pro*
   inclusion, not the core paywall.
5. **Ads: de-prioritize** — low yield, hurts the premium feel, and cannibalizes your own booking
   links. Prefer *sponsored/featured placements* over banner ads.

---

## 1. First — kill the scary number (the cost is a knob)

The ~$1.50/trip was **all-Google, per-user, uncached**. Attack each line:

| Cost line | Worst case (Google) | The free/cheap alternative | After |
|---|---|---|---|
| **Map tiles** | (Google SDK) | **Already Leaflet + OSM** | **$0** ✅ |
| **POI search** (the big one) | Text Search ~$0.035/call | **OpenStreetMap/Overpass (free)** or **Foursquare Places** (generous free tier, cheap) for the FREE tier; Google as premium/enrichment | **~$0** |
| **Photos** | Place Photos ~$0.007 | **Wikimedia/Wikipedia (free)** — already your hero source | **~$0** |
| **Geocoding** | ~$0.005 | **Photon/Nominatim (free)** — you already use Photon for address search | **~$0** |
| **Repeat lookups** | per-user | **Shared server-side cache** (Phase 2): "San Diego Zoo" fetched once, served to thousands | **slashed** |

**Net:** a free tier on **OSM/Foursquare + Wikimedia photos + shared cache** costs **single-digit
cents per trip**, not $1.50. Reserve **Google Places (richer ratings/hours/photos)** for the **paid
tier** or as opportunistic enrichment. *This is the single most important move — it makes "free"
sustainable.*

> Trade-off to accept: OSM/Foursquare POI data is less complete than Google (fewer ratings/photos
> on obscure places). Fine for a free tier; Google becomes a paid upgrade ("richer place data").

---

## 2. Your proposed model, scored

| Stream | Verdict | Why |
|---|---|---|
| **Free for most** | ✅ **Yes, after §1** | Cost becomes cents/trip; covered easily by bookings |
| **Charge for AI** | ◐ **Weak as the core** | AI costs you ~5¢/trip but free substitutes cap willingness-to-pay; charge for it *inside Pro*, not standalone |
| **Booking affiliate** | ✅ **The real engine** | Group trips = multiple rooms + activities = high basket |
| **Ads** | ○ **De-prioritize** | Low yield in a planning app; hurts premium feel; competes with your own booking links |

---

## 3. Booking affiliate — the math that makes free work

**Affiliate economics (ballpark — verify):**
| Category | Your cut of booking value | Notes |
|---|---|---|
| **Hotels** (Booking.com, Expedia/EAN, Hotels.com) | **~3–6%** (a share of the platform's ~15% commission) | the core |
| **Activities/tours** (Viator, GetYourGuide) | **~8%** | high-margin, easy attach |
| Rental cars | ~4–6% | |
| Flights | ~1% / flat | thin — don't rely on it |

**Why group travel is the unlock:** a multi-family trip books **several rooms × nights + activities**
→ baskets of **$3,000–$15,000+**.
```
Group hotel basket ~$5,000 × 4% ≈ $200 affiliate
+ activities ~$1,000 × 8%       ≈ $80
                                ──────
              ≈ $280 potential / trip that actually books through you
```
Even at a **modest 10% booking-attach rate**: 0.10 × $280 ≈ **$28 blended revenue/trip** — against a
**few-cents** free-tier cost. The model isn't just viable; it's **>100× cost** if attach works.

**The catch = conversion.** Planning ≠ booking; people drift to book elsewhere. Mitigate:
- One-tap, in-context **Book** on every stay/activity card (you already route hotels → Booking.com —
  just add your **affiliate ID** to the URLs; that's a config/owner step, not a rebuild).
- Your **moat helps**: you know rooms × families → you can pre-fill the exact room/night search →
  higher conversion than a generic link.
- Nudge at the right moment ("lock in tonight's hotel — prices rise").

---

## 4. AI as revenue — reframe
AI is **cheap to run** (~$0.0075/paste, ~$0.02/plan) but **hard to charge for standalone** (ChatGPT
is free). So:
- **Don't** put the paywall on "use AI." **Do** bundle AI into a **Pro tier** alongside things with
  real WTP: unlimited trips, richer Google place data, offline mode, the premium recap/memories,
  advanced planning, priority. AI is a *feature + conversion hook*, margin is trivial.
- Optional **credits** for heavy AI use (Smart Paste, generation) to cap abuse — but as a ceiling,
  not the core model.

## 5. Ads — be careful
- A planning app has **few ad impressions** and travel eCPMs are modest → **pennies/user**.
- Banner ads **undercut the award-worthy feel** and **compete with your booking links** (you'd rather
  the tap go to a commissionable Book button than a $0.01 ad).
- **Better:** *sponsored/featured placements* in Discover (a hotel/tour pays to be surfaced) —
  aligns with the product, higher yield, less ugly. Treat as a later, secondary line.

---

## 6. Recommended model (the synthesis)
- **Free tier (most users):** full planning + Discover on **OSM/Foursquare + Wikimedia photos +
  shared cache** → cost ≈ cents/trip. The moat (split/coordination) is free → drives group adoption.
- **Primary revenue: booking affiliate** (hotels + activities), conversion-optimized via the moat.
- **Pro tier (later):** richer Google place data, unlimited/offline, premium recap, **AI assists
  included** — for power users + the planner/advisor channel.
- **Secondary (later): sponsored placements**, not banner ads.
- **Sequencing:** free + affiliate first (covers costs, grows the base) → Pro + sponsored later.

---

## 7. Risks / honest caveats
- **Affiliate conversion is the whole ballgame** — if attach is ~2% not ~10%, revenue/trip drops 5×
  (still likely > the cents-cost, but margins thinner). **Instrument it.**
- **Affiliate program terms change** + have approval/volume gates (Booking/Expedia onboarding).
- **OSM/Foursquare data quality** is lower than Google — manage UX expectations on the free tier.
- **Cost telemetry is essential** — measure real Places calls + booking clicks per trip ASAP to
  replace these estimates with truth.
- Numbers are training-data estimates; verify affiliate rates + Google's 2025 free-tier terms live.

## 8. Cheapest highest-leverage next steps (no spend)
1. **Add telemetry** (deterministic, local): count Places calls, Claude tokens, and Book-button taps
   per trip → real COGS + conversion signal. *(safe autonomous item)*
2. **Spike an OSM/Foursquare Discover path** behind a flag → measure data quality vs Google for the
   free tier.
3. **Add affiliate IDs** to the existing Booking URLs (owner step) → turn on the revenue line you
   already have plumbing for.

*Voyara · business model & cost strategy · estimates, verify live · 2026-06*
