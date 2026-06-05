/**
 * destinationImage.test.js — the free (Wikipedia) destination-photo helper.
 * Mocks fetch: parse shape, thumb up-scaling, city normalization, null fallbacks,
 * and in-memory caching (so a city isn't re-fetched in a session).
 */
import { fetchDestinationImage } from '../destinationImage';

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

afterEach(() => { global.fetch = undefined; });

test('returns image + title + page url (thumbnail used as-is)', async () => {
  global.fetch = jest.fn(() => ok({
    title: 'San Diego',
    thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/SD.jpg/320px-SD.jpg' },
    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/San_Diego' } },
  }));
  const r = await fetchDestinationImage('San Diego, California, USA');
  expect(r.title).toBe('San Diego');
  expect(r.imageUrl).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/SD.jpg/320px-SD.jpg'); // thumbnail as-is
  expect(r.pageUrl).toContain('/wiki/San_Diego');
  // city normalized to "San Diego" (first segment) in the request
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/page/summary/San%20Diego'),
    expect.any(Object),
  );
  // a descriptive User-Agent is sent — Wikimedia 403s the default okhttp UA
  const headers = global.fetch.mock.calls[0][1].headers;
  expect(headers['User-Agent']).toMatch(/Kithova/);
});

test('caches per city — a second call does not re-fetch', async () => {
  global.fetch = jest.fn(() => ok({ title: 'Paris', thumbnail: { source: 'https://x/200px-P.jpg' } }));
  await fetchDestinationImage('Paris');
  await fetchDestinationImage('Paris, France');   // same city → cached
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('null when there is no image or the request fails', async () => {
  global.fetch = jest.fn(() => ok({ title: 'Nowhereville' })); // no thumbnail/original
  expect(await fetchDestinationImage('Nowhereville')).toBeNull();
  global.fetch = jest.fn(() => Promise.resolve({ ok: false }));
  expect(await fetchDestinationImage('Errortown')).toBeNull();
  expect(await fetchDestinationImage('')).toBeNull();           // empty input
});
