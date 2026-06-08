# Smart Paste — "paste an itinerary, get a trip" (design + honest assessment)

> Status: **✅ LIVE & DEVICE-VERIFIED end-to-end (2026-06-08).** Owner set `CLAUDE_API_KEY` and
> confirmed the full loop on device: paste a Gemini/ChatGPT itinerary → correct multi-day trip
> ("✨ AI" toast, right dates/stops/types) → photos fill in → book each night's hotel in the right
> city. The wedge feature is shipped and demo-ready for the inner network. What's verified:
> - **AI build** — `extractItineraryViaClaude` (Haiku) extracts the real trip; rules parser is the
>   no-key fallback so paste ALWAYS works. Claude is given today's date (resolves bare "June 30").
> - **Robustness** — calendar dates in combined "June 30: Day 1" headers; fully-collapsed Gemini
>   blobs (no newlines/spaces) re-segment; the build can't hang (25s timeout) or fail silently.
> - **Loading UX** — `PasteImportModal` shows a rotating progress overlay; keyboard dismisses on build.
> - **Photos** — `activityPhoto.js` enriches once, FREE-FIRST (Wikipedia → Google fallback, capped),
>   behind a PERSISTENT cache (`photoCache.js`, AsyncStorage) so re-pastes never re-bill.
> - **Per-night lodging** — each stop carries `act.city`; Discover learns every visited city and
>   `nightCityFor` opens "Add a hotel" in that night's city, filtered to hotels (`focusStay`).
>
> Earlier status (history): **ACTIVE — AI-wired, KEY-READY (2026-06-07).** Building from an AI paste
> is the wedge to sell the inner network, so AI does the text-understanding. `RELEASE_FLAGS.smartPaste`
> is **on**. Pipeline: **AI extract (Claude) → deterministic normalize → assemble**, with the rules
> parser as the no-key fallback so paste ALWAYS works.
> - `aiExtract.extractItineraryViaClaude` — the LLM call (Haiku, strict JSON-only prompt, robust
>   parse); reads `config.CLAUDE_API_KEY` (owner-provided) → null without one.
> - `itineraryImport.importTripFromTextAsync` — runs the seam (AI when keyed, else rules) → assembler.
> - `PasteImportModal` — async build with a loading state; shows "AI" vs "auto".
> - Robustness corpus (`smartPasteCases.test.js`) + no-empty-day fallback.
> **⚠️ The LIVE AI path needs the owner to set `CLAUDE_API_KEY` in config.js** (I can't add keys).
> Without it, paste still builds a trip via the deterministic parser. Earlier MVP pieces (still in
> the tree):
> - `src/utils/itineraryParser.js` — parse (stages A–C): markdown bullets/bold, `Day N` + calendar
>   headers, **wall-of-text re-segmentation**, segments, slots, stops, Option A/B, type lexicon,
>   candidate-place extraction + alias/stop-list. (14 tests)
> - `src/utils/itineraryImport.js` — assemble (stage E): parsed → real trip via createTrip +
>   addActivity, OFFLINE (dates→days, slot/explicit→times, type, Option B as skipped, vague→note).
>   (6 tests)
> - `src/modals/PasteImportModal.js` + Home "Paste a plan" button — the end-to-end flow (F).
> - `src/utils/devSeed.js` — a `__DEV__` demo menu incl. a paste-built trip.
>
> **Still TODO: stage D (Places resolution)** — candidate name → coords/hours/cost, which also
> lights up the timezone features. Deliberately deferred (Google Places **API cost** — needs the
> owner present to greenlight + a caching strategy). Until then, imported trips are a complete
> reviewable skeleton (no coords). The rest of this doc is the original assessment.

---

## 1. The honest one-paragraph answer

**Yes — to *good-draft* quality, not perfect — and it's a genuinely strong feature.** It works
deterministically for one reason: this kind of text is **semi-structured** (dated day headers,
"Morning/Afternoon/Evening", "Stop 1/2/3", "Segment N: City"), and the genuinely hard part —
recognising that "Griffith Observatory" is a real place with coordinates, a type, and hours — is
something **Google Places already does for us** (we use it in Discover today). So the "knowledge
graph" is mostly: a **grammar** for the structure + a **lexicon** for actions + **Google Places as
the live place gazetteer**. Where it degrades is **vague prose** ("find a dinner spot", "explore
local galleries") — there's no named entity, so we emit a sensible *generic* stop the user edits.
That's fine, because Voyara's whole model is **draft → you review → apply** (exactly what
auto-arrange does). It will NOT be 100%; it will be "80% there, edit the rest in 2 minutes," which
for this feature is a win.

---

## 2. Why this input is tractable (look at the structure)

The Gemini sample is highly regular — every signal we need is on the surface:

| Signal in the text | Regex/rule | Maps to |
|---|---|---|
| `Segment 2: The Coastal Road Trip (July 3)` | `^Segment \d+: .* \((.+)\)` | a city/region + date span |
| `July 1: Hollywood & Griffith Observatory` | `^(\w+ \d{1,2}): (.+)` | a **day** (date → day index) + title |
| `Morning:` / `Afternoon:` / `Evening:` | `^(Morning|Afternoon|Evening|Night):` | a **slot** (we already have slots.js) |
| `Stop 1 (Huntington Beach): …` | `^Stop \d+ \(([^)]+)\):` | an ordered **stop** + its place |
| `Option A: … / Option B: …` | `^Option ([AB]):` | mutually-exclusive **alternatives** |
| `Land at LAX`, `grab your rental car` | verb/keyword lexicon | a **transport** leg (flight / car) |
| `Check out of your … hotel` | lexicon | a **stay** check-out |
| `typically starting at 9:00 PM`, `9:00 PM` | time regex | an explicit **time** |
| Title-Case noun phrases | capitalisation heuristic | **candidate place names** |

The PoC parser turns the sample into 9 correctly-dated days across 3 segments, with each line
classified to a type and its candidate place(s) extracted — see the test. That's the spine of the
feature, and it's pure + deterministic.

---

## 3. The pipeline (six stages)

```
 pasted text
   │
   ├─ A. NORMALISE/SEGMENT  split into lines; re-segment a wall-of-text on the markers above.
   │      (pure)            Robustness here is real work — pasted text loses newlines.
   │
   ├─ B. STRUCTURE PARSE    segments → days (date→index) → blocks (slot / stop / option / plain).
   │      (pure, PoC done)  Output: a structured intermediate, no places yet.
   │
   ├─ C. ENTITY EXTRACT     per block, pull candidate place names (Title-Case runs + alias KG:
   │      (pure)            "PCH"→Pacific Coast Highway, "the Getty"→Getty Center, "LAX"→airport).
   │                        Filter non-places ("Independence Day", "Big Bay Boom") via a stop-list.
   │
   ├─ D. RESOLVE            each candidate → Google Places Text Search, biased to the segment's
   │      (API, cached)     city → real coords / type / hours / price level. THIS is the gazetteer.
   │                        Reuses places.js + discoverPlaces.mapPlace/inferActivityType.
   │                        No confident match → a GENERIC stop ("Dinner in West Hollywood").
   │
   ├─ E. CLASSIFY + ASSEMBLE  action lexicon → type (transport/stay/food/activity) + sub-mode;
   │      (pure)            slot/time → scheduleDay times; build via createTrip + addActivity.
   │                        Alternatives (Option A/B) → one chosen + the other as a note/skipped.
   │
   └─ F. REVIEW UI          paste box → parsed PREVIEW (per day, editable, "couldn't place these")
          (device)          → Apply. Nothing is written until the user confirms.
```

Stages A–C and E are **pure and unit-testable**. D has an API cost (cacheable). F is the only
device-verified UI.

---

## 4. What's deterministic vs genuinely hard (no sugar-coating)

**Solid deterministically (this text is friendly):**
- Dates → days, segments → cities, slots, stops, options, explicit times. (PoC proves it.)
- Action typing via lexicon: land/fly/airport→flight; drive/rental/PCH/coast→car;
  hotel/check-in/check-out→stay; breakfast/lunch/dinner/dining/cuisine→food; hike/visit/explore/
  museum/park/zoo/tour→activity. ~90% on prose like this.
- Place RESOLUTION once you have a candidate name — Places nails "Griffith Observatory",
  "San Diego Zoo", "Hotel del Coronado", "Mission San Juan Capistrano".

**Hard / where it caps out:**
- **Entity extraction from free prose.** Title-Case heuristics catch most named POIs in this style
  but produce false positives ("Pacific Coast Highway" is a road, "Big Bay Boom" an event) and miss
  lowercased intents ("a dinner spot", "local art galleries"). This is the classic NER problem;
  deterministically you get **good-not-great** recall, improved by the alias/stop-list KG over time.
- **Vague intents** → no entity to resolve → generic stop (acceptable, user edits).
- **Implicit logistics**: "grab your rental car" (no place), "drive 2–2.5 hours" (duration not a
  stop). Rules can model the common ones; the long tail is endless.
- **Wall-of-text paste** (lost newlines) — re-segmentation is fiddly but doable.

**The honest verdict:** deterministic gets you a **reliable structure + ~80% of the stops correctly
placed** on AI-generated, structured input like this. On messy human notes it's weaker. Either way
it's a *draft the user fixes*, which is the right product bar.

---

## 5. So what is the "knowledge graph" here, concretely?

Not a giant pre-built ontology. It's four small, mostly-static pieces + one live service:

1. **Grammar** (the structure rules in §2) — code, ~static.
2. **Action lexicon / type ontology** — verbs/keywords → activity type + sub-mode. We already have
   the seed of this in `discoverPlaces.inferActivityType` + the type system. A few hundred terms.
3. **Alias / abbreviation table** — "PCH"→Pacific Coast Highway, "LAX"→airport code, "the Getty"→
   Getty Center, "LACMA"→Los Angeles County Museum of Art, "SD"→San Diego. Small, curated, grows.
4. **Non-place stop-list** — "Independence Day", holidays, generic nouns to NOT treat as POIs.
5. **Google Places = the live gazetteer** — the actual "graph" of real places with coords/type/
   hours. We don't pre-build it; we query + **cache** resolved names. This is the key insight that
   makes the deterministic approach feasible without a massive dataset.

---

## 6. Reuse — why this is less work than it sounds

A large share of the "build a trip" machinery already exists:

| Need | Already in Voyara |
|---|---|
| Date range → days | `createTrip` builds `days[]` from start/end |
| Slot model (Morning/…) | `slots.js` |
| Place type from Google types | `discoverPlaces.inferActivityType`, `mapPlace` |
| Resolve a name → coords/hours | `places.js` (geocode + Text Search pattern from Stay/ExperienceAgent) |
| Time the stops in a day | `autoArrange.scheduleDay` / `planDay` |
| Per-person cost + split funding | `addActivity` auto-funds the split |
| **Timezones per stop** | the tz work we just shipped — an imported trip gets CDT/PDT/leg labels **for free** |
| Draft → review → apply pattern | `autoArrange` preview flow (mirror it) |

The **new** code is: the parser (A–C, E) + the resolve glue (D) + the paste/preview screen (F).

---

## 7. Supabase — needed?

**Not for the MVP.** Parsing is client-side; Places resolves entities; the trip writes to the
existing Zustand store. Supabase earns its place in **Phase 2** for:
- a **resolved-entity cache / shared KG** ("Griffith Observatory" → place_id/coords/type) so repeat
  imports are instant + cheaper on Places quota, and accuracy compounds across users;
- a curated **alias + stop-list** table editable without shipping an app update;
- (later) server-side parsing if it ever moves off-device.

So: design the resolver behind an interface; back it with an in-memory/AsyncStorage cache for v1;
swap in Supabase later with no parser changes.

---

## 8. The honest AI comparison (you asked "without AI" — here's the trade)

I should be straight with you: the ONE place a small LLM call would crush the deterministic
approach is **Stage C/E (entity + intent extraction)**. "Extract places, meals, lodging, transport
with times from this text as JSON" is a near-solved task for an LLM and would be **far less code and
markedly higher accuracy** than hand-rolled NER — handling messy human notes, not just tidy Gemini
output. The costs of that path: a per-paste API call + key management (your keys-off stance), and
losing pure determinism/testability.

A pragmatic middle that fits your philosophy: **deterministic structure + Places resolution (no
LLM)** — which is what this doc recommends — and *optionally* an LLM **only** as a fallback entity
extractor for blocks the deterministic pass can't resolve, behind the existing `RELEASE_FLAGS.ai`
gate (off by default). You keep a fully-deterministic product; power users can flip on smarter
extraction. Your call — both are viable; I'm not going to pretend pure-deterministic NER matches an
LLM on messy input, because it doesn't.

---

## 9. Effort estimate (focused engineering, ranges)

| Stage | Scope | Effort | Testable w/o device |
|---|---|---|---|
| A. Normalise/segment | line + wall-of-text segmentation | 2–4 d | ✅ |
| B. Structure parse | **PoC done** → harden (date years, ranges, edge layouts) | 1–3 d | ✅ |
| C. Entity extract + alias/stop KG | Title-Case + alias table + filters | 3–5 d | ✅ |
| D. Places resolve + cache | candidate → Places, city-biased, cached, generic fallback | 3–4 d | partial (mock) |
| E. Classify + assemble | lexicon → type/time; build trip; options/dedup | 3–4 d | ✅ |
| F. Paste + preview/edit UI | paste box → editable day preview → Apply | 4–6 d | ❌ device |
| QA on real samples | Gemini/ChatGPT/human notes corpus | 2–3 d | mixed |

**Solid v1: ~3–5 weeks.** **Rough MVP** (structure + Places resolve + basic assemble behind a paste
box, no fancy editing): **~2 weeks.** ~60% of the work is pure + unit-testable; the parser kernel is
the cheap, reliable part — **entity extraction quality is what consumes time and caps accuracy.**

---

## 10. Recommended path

1. **MVP, deterministic, behind a flag** (`RELEASE_FLAGS.smartPaste`): paste box → parse (A–C) →
   resolve via Places (D, cached) → assemble (E) → a **review screen** (F) where unplaced blocks are
   listed as "couldn't auto-place — tap to add". Ship the import as a *draft* every time.
2. Grow the **alias + stop-list KG** from real misses (cheap wins, compounding accuracy).
3. **Phase 2:** Supabase-backed resolved-entity cache + editable KG; optional LLM fallback for the
   entity step behind the AI flag, if you want the messy-notes ceiling raised.

## 11. Risks / honest caveats
- Accuracy on **non-Gemini** text (terse human notes, blogs) is materially lower — set expectations
  in the UI ("we drafted what we could — review below").
- **Places cost**: one import can fire many Text Search calls — cache hard, batch, and resolve
  lazily/on-confirm. (Same cost discipline as Discover.)
- **Date inference**: year is often absent ("July 3") — infer from context/today, let the user fix.
- It's a **draft generator**, never an oracle — keep the review step non-skippable.

---

*Voyara · smart-paste import · design + assessment · 2026-06-07*
