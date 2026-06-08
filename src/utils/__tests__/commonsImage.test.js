/**
 * commonsImage.test.js — the Wikimedia Commons image search (free CC photos). Fetch is injected
 * so we verify the parse, the relevance order, and that maps / flags / SVGs are skipped — no real
 * network. (Wikipedia article-thumbnail path stays in destinationImage; this is the POI fallback.)
 */
import { fetchCommonsImage } from '../destinationImage';

const reply = (pages) => ({ ok: true, json: async () => ({ query: { pages } }) });

describe('fetchCommonsImage', () => {
  test('returns the first real photo thumbnail (skips a leading map)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply({
      10: { title: 'File:Gateway Arch locator map.png', index: 1, imageinfo: [{ thumburl: 'https://upload/map.png', descriptionurl: 'd1' }] },
      20: { title: 'File:Gateway Arch at dusk.jpg', index: 2, imageinfo: [{ thumburl: 'https://upload/640px-arch.jpg', descriptionurl: 'd2' }] },
    }));
    const out = await fetchCommonsImage('Gateway Arch', { fetch: fetchMock });
    expect(out).toMatchObject({ imageUrl: 'https://upload/640px-arch.jpg', title: 'Gateway Arch at dusk.jpg' });
    // queried the Commons file namespace with the place name
    const url = fetchMock.mock.calls[0][0];
    expect(url).toMatch(/commons\.wikimedia\.org/);
    expect(url).toMatch(/gsrsearch=Gateway%20Arch/);
  });

  test('skips SVGs and flags/logos', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply({
      1: { title: 'File:Flag of Tokyo.svg', index: 1, imageinfo: [{ thumburl: 'https://upload/flag.svg' }] },
      2: { title: 'File:Tokyo Tower logo.png', index: 2, imageinfo: [{ thumburl: 'https://upload/logo.png' }] },
      3: { title: 'File:Tokyo skyline.jpg', index: 3, imageinfo: [{ thumburl: 'https://upload/640px-skyline.jpg', descriptionurl: 'd' }] },
    }));
    const out = await fetchCommonsImage('Tokyo Tower xyz', { fetch: fetchMock });   // unique name → not cached
    expect(out.imageUrl).toBe('https://upload/640px-skyline.jpg');
  });

  test('no usable photo → null; empty input → null (no call)', async () => {
    const fetchMock = jest.fn();
    expect(await fetchCommonsImage('  ', { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await fetchCommonsImage('Nowhere zzz', { fetch: jest.fn().mockResolvedValue(reply({})) })).toBeNull();
  });

  test('non-OK response → null (caller falls through to Google)', async () => {
    const out = await fetchCommonsImage('Somewhere qqq', { fetch: jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) });
    expect(out).toBeNull();
  });
});
