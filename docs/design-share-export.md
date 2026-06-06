# Design — Share / export: Trip Plan vs Settlement (two artifacts)

*Design + as-built note. Pairs with [`design-whatsapp-ingest.md`](design-whatsapp-ingest.md)
(getting content *in*) — this is getting the trip *out*.*

---

## The decision
Sharing splits into **two artifacts**, by context — not one combined doc:

| | **Trip Plan PDF** | **Settlement PDF** ("Who pays whom") |
|---|---|---|
| Shared from | the trip ⋮ menu — *"Export Trip Plan (PDF)"* | the **Split tab** — *"Share settlement (PDF)"* |
| Moment | before / during | after |
| Audience | everyone (group chat, in-laws, public) | just the families settling up |
| Contains | cover · group · day-by-day itinerary · per-family **budget estimate** (forecast) | **who-owes-whom transfers** · per-family **net** (paid − owed) · expense list (with payer) · total |
| Sensitivity | low | **high — amounts + balances** |

**Why two:** different moment, different audience, and **money is sensitive** — you shouldn't be
forced to put "who owes whom" on the itinerary you AirDrop to your in-laws. So the plan stays
money-light by default; the settlement is its own clean, actionable doc.

## Why the settlement doc matters most
It's the **viral-loop artifact** — literally what a captain sends the other families to settle up
("the Garcias owe you $312"). Per the strategy, that share-out is the growth engine, so the
settlement deserves to be a **first-class, standalone** doc, not a tail section. It previously
**didn't exist**; the plan PDF only listed expenses flatly and never showed the settlement. Now it
does.

## As built
- **`buildHTML(trip, travelers, { includeExpenses = false })`** — the Trip Plan. The detailed
  expense list is now **opt-in** (default off); the per-family budget *estimate* (planning forecast)
  stays. Pass `includeExpenses: true` for a combined "everything" export later.
- **`buildSettlementHTML(trip, travelers)`** — the Settlement doc. Every figure comes from the
  **deterministic split engine** (`calcSettlements` / `calcBalances` / `calcFamilyBalances` in
  `costs.js`), so the PDF **agrees with the in-app Split tab exactly**. No photos / no API keys → safe
  to share.
- **Entry points:** trip ⋮ menu → `exportTripAsPDF` (plan); **Split tab** → `exportSettlementAsPDF`
  (shown only when there's an actual balance to settle).
- **Locked by** `exportPlan.test.js`: the who-owes-whom transfer renders, per-family net renders,
  the expense payer renders, the all-settled / no-expenses copy renders, and **no API-key/photo leak**
  in a shared file.

## Caveats
- **Needs `expo-print` + `expo-sharing`** (dynamically imported with a graceful "install first"
  alert) — i.e. a real build, not bare Expo Go without them.
- **UI is unverified until device-checked** — confirm both share buttons produce the right PDF and the
  settlement numbers match the Split tab on a real device.

## Future
- A combined **"Export everything"** option (`includeExpenses: true`) for the captain who wants one
  full record.
- The **WhatsApp / @kithova** share path (see `design-whatsapp-ingest.md`) is the same settlement
  artifact, delivered where the group already is.
