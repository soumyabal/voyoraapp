/**
 * photoCache.test.js — the persistent photo cache. Storage is injected (in-memory fake), so we
 * verify the key shape, hit/miss semantics, null (known-miss) caching, and that values survive
 * a simulated restart (drop the in-memory mirror, re-load from storage).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { photoCacheKey, getCachedPhoto, setCachedPhoto, _resetPhotoCache } from '../photoCache';

const fakeStorage = () => {
  const m = {};
  return { getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = v; }, _m: m };
};

describe('photoCacheKey', () => {
  test('lowercases the name and coarse-rounds coords', () => {
    expect(photoCacheKey('Gateway Arch', 38.6247, -90.1848)).toBe('gateway arch@38.62,-90.18');
  });
  test('no coords → name only', () => {
    expect(photoCacheKey('Somewhere')).toBe('somewhere');
  });
});

describe('get/set semantics', () => {
  beforeEach(_resetPhotoCache);

  test('missing key → undefined; stored value → hit', async () => {
    const storage = fakeStorage();
    expect(await getCachedPhoto('k1', { storage })).toBeUndefined();
    await setCachedPhoto('k1', { url: 'u', source: 'wikipedia' }, { storage });
    expect(await getCachedPhoto('k1', { storage })).toEqual({ url: 'u', source: 'wikipedia' });
  });

  test('a stored null is a HIT (known miss), distinct from undefined', async () => {
    const storage = fakeStorage();
    await setCachedPhoto('k2', null, { storage });
    expect(await getCachedPhoto('k2', { storage })).toBeNull();           // cached known-miss
    expect(await getCachedPhoto('never', { storage })).toBeUndefined();   // truly unseen
  });

  test('survives a restart (drop the in-memory mirror, reload from storage)', async () => {
    const storage = fakeStorage();
    await setCachedPhoto('k3', { url: 'persisted', source: 'google' }, { storage });
    _resetPhotoCache();   // simulate app relaunch — memory gone, storage intact
    expect(await getCachedPhoto('k3', { storage })).toEqual({ url: 'persisted', source: 'google' });
  });

  test('empty key is a no-op', async () => {
    const storage = fakeStorage();
    await setCachedPhoto('', { url: 'x' }, { storage });
    expect(await getCachedPhoto('', { storage })).toBeUndefined();
  });
});
