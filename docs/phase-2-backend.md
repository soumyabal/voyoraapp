# Phase 2 — Backend & the Knowledge Base (design)

> Status: **DESIGN / not started.** Decision doc for moving Voyara from local-only to a thin
> backend. Captures the architecture, the **data-licensing constraints** (so they're baked in,
> not discovered later), the Supabase shape, and an **incremental** migration that never breaks the
> working local app. Needs the owner's go-ahead (external accounts, hosting, cost). Not autonomous work.
> Companion: [[smart-paste-demo-lab]] (the knowledge base today = `src/utils/gazetteer.js`).

---

## 1. Why Phase 2 (the real reasons — ordered)

The gazetteer growing is **not** the reason — it's tiny structured data (a few hundred KB even at 10k
cities; bundle or lazy-load it). The real drivers:

1. **A shared place-resolution cache = the knowledge base that compounds.** Resolve a place once,
   reuse for everyone → it improves with usage and we stop paying per-device. *(But see §3 — the
   compounding layer must be built from OPEN data, not cached Google content.)*
2. **API keys off the device.** Google Places + Claude keys are in the app bundle today. Moving them
   server-side is the genuine **App Store ship-blocker**.
3. **Trip sync + sharing/collaboration.** Multi-family group travel wants shared trips and multiple
   captains — impossible on local AsyncStorage. This is core to the differentiator.
4. **Server-side AI.** Smart Paste's Claude generate/extract move behind the backend (key safety +
   heavier processing + caching).

**Do NOT let Phase 2 gate the inner-network demo.** Smart Paste works locally now — demo it, get
users, build the backend in parallel.

---

## 2. ⚖️ Data licensing — the hard constraints (read before building the cache)

> Not legal advice; verify against the live terms and have counsel review before relying on it.
> These are well-known published provisions.

**Google Maps Platform Terms (Places):**
- ❌ **No permanent caching of Places "Content"** (names, hours, ratings, addresses, photos). Limited
  caching (~30 days) for performance, then refresh.
- ✅ **Place IDs may be stored indefinitely** — they're designed to be cached. *The durable key is the
  Place ID; the details behind it are not.*
- ❌ **No "substitute database."** Can't use Google content to build a standalone dataset that
  substitutes for Google's service. A permanent shared POI DB built from Google content violates this.
- ❌ **Place Photos** must be served fresh via Google's photo reference, not stored as your own library.

**Conclusion:** the "compounding knowledge base" canNOT be "cache Google forever." It must be built
from **open data**, with Google as the on-demand fill-the-gaps layer used *within* its caching rules.

---

## 3. The two-layer knowledge base

**Layer 1 — durable, growable, free, legally storable: OPEN data.** This is where the moat lives.

| Source | License | Provides |
|---|---|---|
| **GeoNames** | CC BY | cities, coords, **timezones**, population → *seed the gazetteer from this* |
| **OpenStreetMap** | ODbL | POIs, addresses, geometry (attribution + share-alike on derived DB) |
| **Foursquare Open Source Places** | Apache-2.0 | POI names/categories/coords |
| **Wikidata** | CC0 (public domain) | structured facts; links to Commons images |
| **Wikipedia / Wikimedia Commons** | CC BY-SA | photos *(already used — `destinationImage.js`)* |

**Layer 2 — Google as the premium LIVE layer, used compliantly:** resolve a specific POI →
store only the **Place ID** long-term; cache details ≤30 days then refresh; photos via Google's
reference at display (or prefer the free Wikipedia/Commons path we already have).

**Your own data is yours:** trips, notes, and the **AI extraction output** (Claude's, owned under the
Anthropic commercial terms) — store/share freely.

---

## 4. Supabase shape (minimal)

Postgres + Auth + Storage + Edge Functions.

```
profiles(id, display_name, …)                         -- auth (Supabase Auth)
trips(id, owner_id, name, destination, dates, json)   -- the trip blob (or normalized later)
trip_members(trip_id, user_id, role)                  -- sharing / collaboration (captains)

places_open(key, name, lat, lng, tz, source, attribution, json)
  -- the COMPOUNDING KB, seeded from GeoNames/OSM/Foursquare/Wikidata. Storable forever.
places_google(query_key, place_id, details_json, fetched_at)
  -- Place ID stored long-term; details_json refreshed when fetched_at > 30 days (ToS).
```

**Edge functions (keys live here, never in the app):**
- `POST /resolve-place` — open-data lookup first; on miss, Google Places → write Place ID +
  time-boxed details → return coords/tz/hours.
- `POST /extract` — Claude itinerary extraction (today's `aiExtract`).
- `POST /generate` — Claude itinerary generation (today's `demoLab`, if kept).

---

## 5. Incremental migration (never break the local app)

- **2a — place resolution server-side** (biggest bang): stand up Supabase + `/resolve-place` +
  `places_open`/`places_google`. Move the **Google key** into the edge function. Trips stay local.
  App keeps working; only place lookups change endpoint. **Seed `places_open` from GeoNames** here —
  the gazetteer becomes a server table that grows.
- **2b — auth + trip sync/sharing**: Supabase Auth, `trips`/`trip_members`, migrate AsyncStorage →
  Postgres with a one-time import. Enables shared/collaborative trips.
- **2c — Claude server-side**: move `/extract` + `/generate` behind the backend; drop the Claude key
  from the bundle. Smart Paste calls the edge function.

Each step is shippable on its own and reversible.

---

## 6. The clean seam to build NOW (safe, no backend)

Introduce one `resolvePlace(name, hint)` function that today wraps the offline gazetteer and is
**shaped to call `/resolve-place` tomorrow**. Then the Phase-2 swap changes **one module**, not every
call site. Fully unit-testable, zero cost. *(Deferred until the owner commits to Supabase, to avoid
churn — but it's the first code change when 2a starts.)*

---

## 7. Cost model (rough)

- **Open-data layer:** one-time ingest (GeoNames/OSM dumps) + storage. ~free at this scale.
- **Google fill-ins:** pay once per *new* place across all users (shared cache), within ToS caching.
  Versus today's pay-per-device. This is the COGS win — but the cache stores Place IDs + time-boxed
  details, NOT a permanent content DB.
- **Supabase:** free tier covers early; Pro (~$25/mo) when usage grows.
- **Claude:** unchanged per-call; now metered/rate-limited server-side.

---

*Voyara · Phase 2 design · created 2026-06-08 · supersedes the older roadmap §Phase-2 sketch where they differ.*
