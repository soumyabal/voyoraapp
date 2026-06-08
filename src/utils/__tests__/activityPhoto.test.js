/**
 * activityPhoto.test.js — free-first photo enrichment. Network sources are injected (no real
 * Wikipedia/Google calls), so we verify the free-first preference, the generic-name skip,
 * the Google cost cap, and that URLs are written via the store action.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { isPhotoWorthy, resolveActivityPhoto, enrichTripPhotos } from '../activityPhoto';
import { _resetPhotoCache } from '../photoCache';

// In-memory AsyncStorage stand-in for the persistent photo cache.
const fakeStorage = () => {
  const m = {};
  return { getItem: async (k) => (k in m ? m[k] : null), setItem: async (k, v) => { m[k] = v; }, _m: m };
};

const wikiHit = (name) => ({ imageUrl: `https://wiki/${encodeURIComponent(name)}.jpg`, title: name });
const wikiMiss = async () => null;
const commonsMiss = async () => null;   // inject so no test touches the real Commons network

describe('isPhotoWorthy', () => {
  test('real attractions/meals qualify', () => {
    expect(isPhotoWorthy({ type: 'activity', name: 'Gateway Arch' })).toBe(true);
    expect(isPhotoWorthy({ type: 'food', name: "Lou Malnati's" })).toBe(true);
  });
  test('generic / logistics / already-has-photo are skipped', () => {
    expect(isPhotoWorthy({ type: 'transport', name: 'Drive to St. Louis' })).toBe(false);
    expect(isPhotoWorthy({ type: 'stay', name: 'Hotel check-in' })).toBe(false);
    expect(isPhotoWorthy({ type: 'activity', name: 'Free time' })).toBe(false);
    expect(isPhotoWorthy({ type: 'food', name: 'Dinner' })).toBe(false);
    expect(isPhotoWorthy({ type: 'note', name: 'Pack light' })).toBe(false);
    expect(isPhotoWorthy({ type: 'activity', name: 'Fort Mackinac', photo: 'x' })).toBe(false);
    expect(isPhotoWorthy({ type: 'activity', name: '', status: 'skipped' })).toBe(false);
  });
});

describe('resolveActivityPhoto — free first', () => {
  test('uses Wikipedia when it hits (no Commons / Google call)', async () => {
    const fetchCommons = jest.fn();
    const fetchGoogle = jest.fn();
    const out = await resolveActivityPhoto(
      { name: 'Gateway Arch', lat: 38.6, lng: -90.2 },
      { fetchWiki: async (n) => wikiHit(n), fetchCommons, fetchGoogle },
    );
    expect(out).toEqual({ url: 'https://wiki/Gateway%20Arch.jpg', source: 'wikipedia' });
    expect(fetchCommons).not.toHaveBeenCalled();
    expect(fetchGoogle).not.toHaveBeenCalled();
  });

  test('falls back to Commons when Wikipedia misses (before any Google call)', async () => {
    const fetchGoogle = jest.fn(async () => 'https://g/x.jpg');
    const out = await resolveActivityPhoto(
      { name: 'Fort Mackinac', lat: 45.8, lng: -84.6 },
      { fetchWiki: wikiMiss, fetchCommons: async () => ({ imageUrl: 'https://commons/fort.jpg' }), fetchGoogle },
    );
    expect(out).toEqual({ url: 'https://commons/fort.jpg', source: 'commons' });
    expect(fetchGoogle).not.toHaveBeenCalled();   // Commons hit → never paid for Google
  });

  test('falls back to Google when both free sources miss', async () => {
    const out = await resolveActivityPhoto(
      { name: "Lou Malnati's", lat: 41.9, lng: -87.6 },
      { fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle: async () => 'https://g/photo.jpg' },
    );
    expect(out).toEqual({ url: 'https://g/photo.jpg', source: 'google' });
  });

  test('no Google fallback without coords or when disallowed', async () => {
    const fetchGoogle = jest.fn(async () => 'g');
    expect(await resolveActivityPhoto({ name: 'Somewhere' }, { fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle })).toBeNull();
    expect(await resolveActivityPhoto({ name: 'X', lat: 1, lng: 2 }, { fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle, allowGoogle: false })).toBeNull();
    expect(fetchGoogle).not.toHaveBeenCalled();
  });

  test('never throws if a source errors', async () => {
    const out = await resolveActivityPhoto(
      { name: 'Boom', lat: 1, lng: 2 },
      { fetchWiki: async () => { throw new Error('net'); }, fetchCommons: async () => { throw new Error('net'); }, fetchGoogle: async () => { throw new Error('net'); } },
    );
    expect(out).toBeNull();
  });
});

describe('enrichTripPhotos — writes via the store, caps Google', () => {
  const makeStore = (trip) => {
    const store = { trips: [trip] };
    store.updateActivity = (tid, aid, updates) => {
      for (const d of store.trips.find(t => t.id === tid).days) {
        d.activities = d.activities.map(a => (a.id === aid ? { ...a, ...updates } : a));
      }
    };
    return store;
  };
  const A = (id, name, type, lat, lng) => ({ id, name, type, lat, lng });

  test('Wikipedia fills every worthy stop, skips generic, leaves photos on activities', async () => {
    const trip = { id: 't1', days: [
      { activities: [A('a1', 'Gateway Arch', 'activity', 38.6, -90.2), A('t1', 'Drive to Chicago', 'transport', 41.9, -87.6)] },
      { activities: [A('a2', 'Fort Mackinac', 'activity', 45.8, -84.6)] },
    ] };
    const store = makeStore(trip);
    const res = await enrichTripPhotos(store, 't1', { storage: null, fetchWiki: async (n) => wikiHit(n), fetchCommons: commonsMiss, fetchGoogle: jest.fn() });
    expect(res.enriched).toBe(2);          // both activities, not the transport
    expect(res.googleUsed).toBe(0);
    const photos = store.trips[0].days.flatMap(d => d.activities).map(a => a.photo);
    expect(photos.filter(Boolean)).toHaveLength(2);
  });

  test('Google fallback is capped per trip', async () => {
    const acts = Array.from({ length: 5 }, (_, i) => A(`a${i}`, `Place ${i}`, 'activity', 1, 2));
    const trip = { id: 't2', days: [{ activities: acts }] };
    const store = makeStore(trip);
    const fetchGoogle = jest.fn(async () => 'https://g/x.jpg');
    const res = await enrichTripPhotos(store, 't2', { storage: null, fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle, googleCap: 2 });
    expect(res.googleUsed).toBe(2);
    expect(fetchGoogle).toHaveBeenCalledTimes(2);   // capped — not all 5
    expect(res.enriched).toBe(2);
  });
});

describe('enrichTripPhotos — persistent cache reuse (cross-restart, no re-bill)', () => {
  beforeEach(_resetPhotoCache);   // forget the in-memory mirror between tests
  const makeStore = (trip) => {
    const store = { trips: [trip] };
    store.updateActivity = (tid, aid, updates) => {
      for (const d of store.trips.find(t => t.id === tid).days) {
        d.activities = d.activities.map(a => (a.id === aid ? { ...a, ...updates } : a));
      }
    };
    return store;
  };
  const tripOf = (id) => ({ id, days: [{ activities: [{ id: 'a1', name: 'Graceland', type: 'activity', lat: 35.04, lng: -90.02 }] }] });

  test('a second run resolves from cache with NO network call', async () => {
    const storage = fakeStorage();
    const fetchGoogle = jest.fn(async () => 'https://g/graceland.jpg');

    // Run 1: Wikipedia misses → Google hit, result persisted.
    const r1 = await enrichTripPhotos(makeStore(tripOf('t1')), 't1', { storage, fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle });
    expect(r1).toMatchObject({ enriched: 1, googleUsed: 1, fromCache: 0 });
    expect(fetchGoogle).toHaveBeenCalledTimes(1);

    // Run 2 (simulated restart): same place → served from the PERSISTED cache, no fetch, no bill.
    _resetPhotoCache();                       // drop the in-memory mirror; storage still holds it
    const store2 = makeStore(tripOf('t2'));
    const r2 = await enrichTripPhotos(store2, 't2', { storage, fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle });
    expect(r2).toMatchObject({ enriched: 1, googleUsed: 0, fromCache: 1 });
    expect(fetchGoogle).toHaveBeenCalledTimes(1);   // STILL 1 — no second Google call
    expect(store2.trips[0].days[0].activities[0].photo).toBe('https://g/graceland.jpg');
  });

  test('a known photo-LESS place is remembered too (no retry storm)', async () => {
    const storage = fakeStorage();
    const fetchGoogle = jest.fn(async () => null);   // Google also misses

    await enrichTripPhotos(makeStore(tripOf('t1')), 't1', { storage, fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle });
    expect(fetchGoogle).toHaveBeenCalledTimes(1);

    _resetPhotoCache();
    const r2 = await enrichTripPhotos(makeStore(tripOf('t2')), 't2', { storage, fetchWiki: wikiMiss, fetchCommons: commonsMiss, fetchGoogle });
    expect(r2).toMatchObject({ enriched: 0, fromCache: 0 });
    expect(fetchGoogle).toHaveBeenCalledTimes(1);   // the known-miss is cached → not retried
  });
});
