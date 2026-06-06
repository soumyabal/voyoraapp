# Design — Premium ingestion: WhatsApp → trip

*Design-only (no code). How users get their plans / expenses / pics **out of WhatsApp and tied to a
Kithova trip** — a premium feature. Pairs with [`business-case.md` §5](business-case.md) (the
@kithova vision) and [`state-of-kithova.md`](state-of-kithova.md).*

---

## The hard constraint that shapes everything
**WhatsApp exposes no API to read a group's messages.** Third parties cannot passively listen to or
pull a group's history. Unofficial scrapers (whatsapp-web.js et al.) **violate WhatsApp ToS and get
numbers banned** — not viable for a product. **Therefore every mechanism must be user-initiated**
(the user hands us the content), never passive reading. That's also good for privacy (consent is
built into the act of sharing).

## The three viable, ToS-compliant mechanisms

### ① Export-chat → import to trip — *the direct "copy my WhatsApp trip" answer*
WhatsApp's built-in **Export Chat** produces a `.txt` transcript **+ the media**. Flow:
*WhatsApp → Export Chat (with media) → Share to Kithova → pick the trip →* Kithova parses it.
- **Bulk, one-time** consolidation of an existing trip's chat.
- **Consent-clean** (the user exports their own data).
- Best fit for *"copy their travel plans, expenses and pics in WhatsApp and tie it to the trip."*

### ② Native Share Sheet — *ongoing, lowest friction*
In WhatsApp **or** Photos: select items → **Share → Kithova → choose trip/day.**
- Great for "add these few pics to the cabin trip" during/after the trip.
- **No WhatsApp API**; works natively on **iOS and Android**.

### ③ Kithova WhatsApp number / bot (**@kithova**) — *the "zero new app" vision (later)*
Users forward content to a Kithova **WhatsApp Business** number; it ingests to the linked trip.
- Slickest ("no behavior change"), but the **heaviest**: Meta approval, **per-message cost**,
  **opt-in / 1:1 only** (it sees only what's sent to it, never the group).
- Phase-4 exploration + the IP angle (see flags below).

## What's clean vs fuzzy (set expectations)
| Content | Mechanism that fits | Reliability | How it ties to the trip |
|---|---|---|---|
| **Pics / videos** | ①, ②, ③ | **Clean** | **EXIF timestamp → day**; GPS (if present) → place; archive to premium storage |
| **Expenses** | ① (parse export), ②/③ (per item) | **Semi-clean** | regex/NLP pulls `$` amounts; **sender → likely payer**; surfaced as *suggested* rows to confirm |
| **Plans** | ① / manual | **Fuzzy** | extract place/date mentions → *suggested* stops; chat is unstructured, so the user curates |

**Rule:** photos import cleanly and carry the emotional value; expenses are **"review & confirm
suggestions,"** not silent writes (it touches the split — never auto-mutate money from fuzzy text);
plans are suggestive only. Don't over-promise structured day-plans from chat text.

## Auto-classification (how "tie to trip" works)
- **Trip:** auto-suggest by date overlap (the export's date range vs the user's trips); user confirms.
- **Day:** photo/message timestamp → the matching `trip.days[i]`.
- **Family/payer:** the WhatsApp sender name → fuzzy-match to a trip member/family (user maps once).
- **Dedup:** hash imported media so re-importing the same chat doesn't double-add.
- **Money safety:** parsed expenses land as **drafts**; nothing hits the deterministic split until the
  user accepts. (Consistent with "AI/parsers never silently touch the money.")

## Why it's a strong **premium** feature
It attacks the two pains by name: the **cross-platform memory black hole** (mixed iOS+Android groups
have no shared home — Apple/Google memories don't cross platforms) and **"it's all stuck in
WhatsApp."** Monetization logic is clean: **free** users plan & split; **premium** users *consolidate
and keep* the whole trip (archive + storage + this import). The archive is also the **switching
cost.**

## Build caveats (so it can be planned)
- **Phase 2+ (needs native + backend).** A Share Extension / Android Share-Intent and chat-export
  parsing require an **EAS dev build** (not Expo Go — e.g. the `expo-share-intent` config-plugin
  route); the archive needs **cloud storage**. Both are backend-era — which is fine, it's premium.
- **Storage COGS + privacy/liability.** Hosting families' photos (incl. **children**) raises real
  privacy, retention, moderation, and cost questions; the current "no servers" privacy posture
  changes. Mitigate: store only what's imported; thumbnails/references where possible; clear
  retention + delete controls.
- **Export format drift.** WhatsApp's export `.txt`/media layout can change across versions and
  differs iOS↔Android; the parser needs to be defensive + version-tolerant. iOS caps export size.
- **③ feasibility/IP (flag, not a verdict — I'm not a lawyer):** the @kithova bot mechanism *may* be
  novel, but chat bots / shared albums / email-to-album / travel chatbots exist → **a real prior-art
  & patentability search (USPTO · Google Patents · patent attorney) is required** before claiming
  novelty, and the **WhatsApp Business API** policy/cost limits must be validated (opt-in per-trip
  contact, not a passive group listener).

## Recommendation & sequencing
1. **Pics first** via **① export-chat import + ② Share Sheet** — ToS-clean, cross-platform, no Meta
   approval, highest emotional value, direct premium tie-in (storage/archive).
2. **Expenses second** — assisted "confirm suggested expenses" from the same import.
3. **Plans last** — suggestive extraction only.
4. **③ the @kithova bot** — Phase-4 bet (the "zero behavior change" + patent exploration).

**One line:** *don't try to read WhatsApp — let users hand us the trip (export or share), auto-place
the photos by date, suggest the expenses, and keep it all in one cross-platform home. That's the
premium consolidation no Photos/Splitwise/Wanderlog offers.*
