/**
 * aiExtract.test.js — the LLM extractor. NO real key, NO real network: config is mocked with a
 * fake key and fetch is injected, so we verify prompt/parse/error handling deterministically.
 */
jest.mock('../../config', () => ({
  CLAUDE_API_KEY: 'test-key',
  CLAUDE_MODEL: 'claude-haiku-test',
  CLAUDE_API_URL: 'https://example.test/v1/messages',
}));

import { extractItineraryViaClaude, extractJsonObject } from '../aiExtract';

const claudeReply = (jsonText) => ({
  ok: true,
  json: async () => ({ content: [{ text: jsonText }] }),
});

describe('extractJsonObject', () => {
  test('parses bare JSON', () => {
    expect(extractJsonObject('{"days":[]}')).toEqual({ days: [] });
  });
  test('strips ```json fences and surrounding prose', () => {
    const r = extractJsonObject('Sure! ```json\n{"days":[{"dayNumber":1}]}\n``` done');
    expect(r.days[0].dayNumber).toBe(1);
  });
  test('returns null on unparseable text', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('extractItineraryViaClaude', () => {
  test('calls the API and returns the parsed contract', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      claudeReply('{"days":[{"dayNumber":1,"city":"Tokyo","items":[{"name":"Sensoji","type":"activity"}]}]}'),
    );
    const out = await extractItineraryViaClaude('Day 1 in Tokyo: Sensoji', { fetch: fetchMock });
    expect(out.days[0].city).toBe('Tokyo');
    expect(out.days[0].items[0].name).toBe('Sensoji');
    // sent to the right endpoint with auth + the model
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body).model).toBe('claude-haiku-test');
  });

  test('returns null on a non-OK response (caller falls back to rules)', async () => {
    const out = await extractItineraryViaClaude('x', { fetch: jest.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }) });
    expect(out).toBeNull();
  });

  test('returns null when the reply has no JSON', async () => {
    const out = await extractItineraryViaClaude('x', { fetch: jest.fn().mockResolvedValue(claudeReply('I could not parse that.')) });
    expect(out).toBeNull();
  });

  test('returns null on a fetch error (resilient)', async () => {
    const out = await extractItineraryViaClaude('x', { fetch: jest.fn().mockRejectedValue(new Error('network')) });
    expect(out).toBeNull();
  });

  test('a hanging request is aborted by the timeout → null (build falls back, never hangs)', async () => {
    // A fetch that never resolves on its own, but rejects when the abort signal fires.
    const hangingFetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });
    const out = await extractItineraryViaClaude('Day 1: Tokyo', { fetch: hangingFetch, timeoutMs: 20 });
    expect(out).toBeNull();
  });

  test('empty text → null without calling the API', async () => {
    const fetchMock = jest.fn();
    expect(await extractItineraryViaClaude('   ', { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('extractItineraryViaClaude — no key', () => {
  // Re-mock config with a null key for this block.
  beforeAll(() => { jest.resetModules(); });
  test('returns null when CLAUDE_API_KEY is unset (graceful, no call)', async () => {
    jest.isolateModules(() => {
      jest.doMock('../../config', () => ({ CLAUDE_API_KEY: null, CLAUDE_MODEL: 'm', CLAUDE_API_URL: 'u' }));
    });
    // eslint-disable-next-line global-require
    const { extractItineraryViaClaude: noKeyExtract } = require('../aiExtract');
    const fetchMock = jest.fn();
    expect(await noKeyExtract('Day 1: something', { fetch: fetchMock })).toBeNull();
  });
});
