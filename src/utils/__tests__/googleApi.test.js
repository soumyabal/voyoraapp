/**
 * googleApi.test.js — the Google bundle-id header helper.
 *
 * Locks that withBundleId() adds X-Ios-Bundle-Identifier without dropping existing
 * headers, and that the hard-coded IOS_BUNDLE_ID stays in sync with app.json's
 * ios.bundleIdentifier (there's no expo-constants in this project to read it at
 * runtime, so this test is the drift guard for the App-Store key restriction).
 */
import { IOS_BUNDLE_ID, withBundleId } from '../googleApi';
import appJson from '../../../app.json';

describe('withBundleId', () => {
  test('adds the bundle-id header to an empty set', () => {
    expect(withBundleId()).toEqual({ 'X-Ios-Bundle-Identifier': IOS_BUNDLE_ID });
  });

  test('preserves existing headers and adds the bundle id', () => {
    const out = withBundleId({
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': 'k',
      'X-Goog-FieldMask': 'places.location',
    });
    expect(out).toEqual({
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': 'k',
      'X-Goog-FieldMask': 'places.location',
      'X-Ios-Bundle-Identifier': IOS_BUNDLE_ID,
    });
  });

  test('does not mutate the input object', () => {
    const input = { 'X-Goog-Api-Key': 'k' };
    withBundleId(input);
    expect(input).toEqual({ 'X-Goog-Api-Key': 'k' });
  });

  test('IOS_BUNDLE_ID matches app.json ios.bundleIdentifier (drift guard)', () => {
    expect(IOS_BUNDLE_ID).toBe(appJson.expo.ios.bundleIdentifier);
  });
});
