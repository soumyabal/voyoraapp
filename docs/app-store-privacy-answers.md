# App Store Connect — "App Privacy" answers (internal cheat-sheet)

> Internal note, **not** for publishing. This maps Kithova's actual data behavior (verified
> against the code on June 8, 2026) to the questions Apple asks in **App Store Connect → your app
> → App Privacy**. Re-verify before each submission; answers change the moment you add accounts,
> the full AI planner/chat, analytics, or any new network call.

## The headline answer

When Apple asks **"Do you or your third-party partners collect data from this app?"** the honest
answer for the current (local-only, no-accounts, no-analytics, **Smart-Paste-AI-on**) build is
nuanced:

- **We (Kithova) collect nothing** — no servers, no account, no analytics.
- **But** the app sends user-typed place searches/addresses to mapping services (Google,
  Wikipedia, Komoot/OSM) to function. Apple's definition of "collect" includes data sent off the
  device by third-party code. So you generally should **answer "Yes, data is collected"** and
  declare the items below as **"App Functionality," "Not linked to the user," "Not used for
  tracking."** (Apple has a narrow exception for data sent only to provide the feature and not
  stored — but selecting Yes and the conservative options below is the safe, defensible choice.)
- **Smart Paste (on in this build):** when the user pastes an itinerary and imports it, that
  **pasted text is sent to Anthropic (Claude)** to build the trip. This is the one AI network call.
  It's **User Content sent to a third party for App Functionality** — declared in the table below.
  Sent only on the user's explicit import tap; we send only the pasted text (no saved trips,
  traveler names, or expenses).

## What to declare

| Apple data type | Collected? | Linked to identity? | Used for tracking? | Purpose | Notes |
|---|---|---|---|---|---|
| **Coarse/Precise Location** | **No** | — | — | — | App uses NO device GPS. "Location" = typed text only → declare under *Search History*, not Location. |
| **Search History** | **Yes** | No | No | App Functionality | The place/hotel/attraction text users type, sent to Google/Komoot/Wikipedia to return results. |
| **Other User Content** (typed addresses + Smart Paste text) | **Yes** | No | No | App Functionality | Addresses/place names typed for geocoding (could fold into Search History), **and the itinerary text the user pastes into Smart Paste, sent to Anthropic/Claude** to build the trip. Sent only on the explicit import tap; not stored by us. |
| Contact Info (name, email) | **No** | — | — | — | No accounts in this build. |
| Identifiers (user/device ID) | **No** | — | — | — | No analytics/ad SDKs; no login. |
| Usage Data / Analytics | **No** | — | — | — | No analytics SDK present. |
| Diagnostics / Crash data | **No** | — | — | — | Not collected by us (confirm you don't enable any crash reporter in the build). |
| Health, Financial, Contacts, Photos, Browsing, Purchases, Sensitive | **No** | — | — | — | None accessed. (Expenses are stored on-device only, never transmitted → not "collected.") |

## "Tracking" (ATT)

Kithova does **not** track users across apps/sites and has no ad/attribution SDKs, so you do
**not** need the App Tracking Transparency prompt. Answer **No** to tracking for every item above.

## Other submission essentials (not the privacy form, but easy to forget)

- **Privacy Policy URL** (required field): host `docs/privacy-policy.md` at e.g.
  `https://kithova.com/privacy` and paste the URL.
- **Age rating questionnaire:** travel app, no objectionable content → expect 4+.
- **Export compliance:** the app uses only standard HTTPS encryption → typically "exempt" (answer
  the encryption questions accordingly).
- **Data NOT collected attestation:** since most rows are "No," App Store Connect will let you
  attest accordingly for those categories.

## When these answers change

Flip to re-review the moment you ship any of: accounts/login (Contact Info, Identifiers), the
**full** AI planner/chat (more trip data sent to an AI provider — Smart Paste's pasted-text case is
already covered above), cloud sync (Other User Content collected + linked), analytics/crash
reporting (Usage/Diagnostics), or real bookings (Purchases, Financial).
