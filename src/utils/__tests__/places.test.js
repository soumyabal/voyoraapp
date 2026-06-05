/**
 * places.test.js — refreshPhotoKey: thumbnails must survive an API-key rotation.
 *
 * Stored place-photo URLs bake the key into the URL; when the key is rotated the old key
 * dies and every saved thumbnail 403s. refreshPhotoKey re-stamps the CURRENT key at render.
 */
jest.mock('../../config', () => ({ GOOGLE_PLACES_API_KEY: 'NEWKEY' }));

import { refreshPhotoKey } from '../places';

describe('refreshPhotoKey', () => {
  test('re-stamps the current key on a stored Google photo URL (old key swapped out)', () => {
    const stored = 'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=640&maxHeightPx=420&key=OLDKEY';
    expect(refreshPhotoKey(stored)).toBe(
      'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=640&maxHeightPx=420&key=NEWKEY'
    );
  });

  test('leaves non-Google URLs (e.g. Wikipedia) untouched', () => {
    const wiki = 'https://upload.wikimedia.org/wikipedia/commons/x.jpg';
    expect(refreshPhotoKey(wiki)).toBe(wiki);
  });

  test('passes through empty / null safely', () => {
    expect(refreshPhotoKey(null)).toBe(null);
    expect(refreshPhotoKey('')).toBe('');
    expect(refreshPhotoKey(undefined)).toBe(undefined);
  });
});
