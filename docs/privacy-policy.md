# Kithova — Privacy Policy

**Effective date: June 8, 2026**

> **Note for the Kithova team (delete before publishing):** This is an honest, code-accurate
> *draft starting point*, not legal advice. Before you publish it at `https://kithova.com/privacy`
> and paste that URL into App Store Connect, please (1) have someone review it, (2) confirm the
> contact email and any legal entity name, and (3) re-check the "What leaves your device" list
> against the shipped build. Keep it in sync whenever you add a service that makes a network call
> (accounts, the AI planner, real hotel pricing, analytics, etc.).

---

## The short version

Kithova is a trip planner for families and groups. **We don't run servers, we don't have
accounts, and we don't track you.** Your trips, travelers, and expenses are saved **only on your
device**. The information that leaves your phone is (1) the place names and addresses you type
while planning — which we pass to a few well-known mapping services so the app can find hotels,
attractions, and directions for you — and (2) **if you use the optional Smart Paste feature**, the
itinerary text you paste, which we send to an AI service to turn into a trip. We don't sell your
data, show ads, or use analytics.

---

## 1. Who we are

Kithova ("we", "us") provides the Kithova mobile app. You can reach us at **privacy@kithova.com**.

## 2. Information stored on your device

Everything you create in Kithova is stored **locally on your device** (using the operating
system's standard on-device storage) and is **not transmitted to us** — we have no backend to
receive it. This includes:

- Your trips (names, destinations, dates, day-by-day plans, notes)
- Traveler and family profiles you add — which may include names, ages, dietary preferences, and
  accessibility needs, **including for children if you choose to add them**
- Expenses and who's splitting them

Because this data lives only on your device, deleting the app removes it. We cannot access,
recover, or restore it for you.

## 3. What leaves your device, and why

To make planning work, Kithova sends **the place names, search terms, and addresses you type**
(and the map area you're viewing) to the following third-party services. We send only what's
needed to answer your request — never your traveler names, family details, or expenses.

| Service | What we send | Why | Their privacy policy |
|---|---|---|---|
| **Google Maps Platform** (Places, Geocoding, Distance Matrix) | Your place/hotel/attraction searches, addresses you enter, and coordinates of the area you're viewing | To find places, photos, and ratings; convert addresses to map points; and (only if you turn on the optional distance check) estimate travel distances | https://policies.google.com/privacy |
| **Wikipedia / Wikimedia Foundation** | The destination name | To show a short summary and photo of your destination | https://foundation.wikimedia.org/wiki/Policy:Privacy_policy |
| **Photon by Komoot** (uses OpenStreetMap data) | The location text you type into a search box | To suggest matching addresses/places as you type | https://www.komoot.com/privacy |
| **OpenStreetMap tile servers** | The coordinates of the map area shown | To draw the map | https://wiki.osmfoundation.org/wiki/Privacy_Policy |
| **Anthropic (Claude AI)** — *only if you use Smart Paste* | The itinerary text you choose to paste into Smart Paste | To read that text and turn it into a structured trip (days, places, times). Sent only when you tap to import — never automatically | https://www.anthropic.com/legal/privacy |

These services may log requests (for example, an IP address) under their own privacy policies. We
don't control their handling of that data. Anthropic processes the text you paste under its own
privacy policy and, under its API terms, does not use it to train its models.

## 4. What we do NOT do

- **No accounts / no login.** Kithova works without you creating an account.
- **No device location / GPS.** The app does not request or use your precise device location. The
  only "location" involved is the text you type.
- **No analytics, tracking, advertising, or third-party trackers.** We don't include any analytics
  or ad SDKs.
- **No selling or sharing of personal data** beyond the functional mapping services listed above.
- **AI is used only for Smart Paste, and only on text you paste.** Kithova's AI trip planner and
  in-trip AI chat are turned off in this version. The one AI feature is **Smart Paste**: when you
  paste an itinerary and ask Kithova to build a trip from it, the text you pasted is sent to
  Anthropic (Claude) to convert it into a structured plan. We send **only that pasted text** —
  never your saved trips, traveler names, family details, or expenses. If you never use Smart
  Paste, no trip data is ever sent to an AI provider. (Smart Paste also has an on-device fallback
  that uses no AI.)

## 5. Children's privacy

Kithova is a general-audience travel app, not directed at children. You may choose to add family
members — including children's names and ages — to a trip. That information is stored **only on
your device** and is **never sent to us or to the mapping services**. We do not knowingly collect
personal information from children.

## 6. Data retention and deletion

Since your data is stored only on your device, **you control it completely**. Delete individual
trips/travelers/expenses in the app, or delete the app to remove everything. We hold no copy.

## 7. Security

Your data stays on your device under your device's own protections (passcode, biometrics, OS
sandboxing). Requests to the mapping services are made over encrypted (HTTPS) connections.

## 8. Changes to this policy

If we change how Kithova handles data — for example, by adding accounts, cloud sync, AI features,
or real booking — we'll update this page and revise the effective date above.

## 9. Contact

Questions about privacy? Email **privacy@kithova.com**.
