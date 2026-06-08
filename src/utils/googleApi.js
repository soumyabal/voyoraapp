/**
 * googleApi.js — shared header plumbing for Google Maps Platform requests.
 *
 * For the App Store / TestFlight, the Google Places key (currently in the bundle,
 * unrestricted) should be locked to this app in the Cloud Console:
 *   key → Application restrictions → iOS apps → add bundle `com.kithova.app`.
 * Google enforces that by checking the `X-Ios-Bundle-Identifier` request header, so
 * EVERY Google API call must carry it. This module is the single source of that header.
 *
 * SAFE to send unconditionally: an UNrestricted key simply ignores the header, so adding
 * it is a no-op until the restriction is switched on in the console. That lets us ship the
 * header now and flip the restriction later with no code change.
 *
 * ⚠️ NOT yet covered: place-photo thumbnails bake the key into the URL and render via RN
 * `<Image source={{uri}}>`, which doesn't send this header. So enabling the *iOS application*
 * restriction would 403 photos until those Image sources also pass `headers` — a device-verify
 * step (see docs/backlog.md). The fetch-based calls (search, geocode, distance) are covered here.
 * Until then, an *API restriction* (limit the key to Places/Geocoding/Distance Matrix) is the
 * zero-code-change, zero-risk first step.
 *
 * Keep IOS_BUNDLE_ID in sync with app.json `ios.bundleIdentifier` by hand (this project has no
 * expo-constants to read it at runtime).
 */
export const IOS_BUNDLE_ID = 'com.kithova.app';

/**
 * Merge the iOS bundle-id header into an existing headers object for fetch().
 * @param {object} headers existing request headers (Content-Type, X-Goog-*, …)
 * @returns a new headers object that also carries X-Ios-Bundle-Identifier
 */
export function withBundleId(headers = {}) {
  return { ...headers, 'X-Ios-Bundle-Identifier': IOS_BUNDLE_ID };
}
