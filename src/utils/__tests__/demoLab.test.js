/**
 * demoLab.test.js — the DEV AI demo-trip generator. Config is mocked with a fake key and the
 * network is injected, so we verify the generate call + the full generate→extract→build flow
 * deterministically (no real Claude calls).
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../config', () => ({
  CLAUDE_API_KEY: 'test-key', CLAUDE_MODEL: 'claude-haiku-test', CLAUDE_API_URL: 'https://example.test/v1/messages',
}));

import useStore from '../../store';
import { DEMO_PROMPTS, generateItineraryText, buildDemoTrip } from '../demoLab';

describe('DEMO_PROMPTS', () => {
  test('is a non-empty set of {id,title,text}', () => {
    expect(DEMO_PROMPTS.length).toBeGreaterThanOrEqual(8);
    for (const p of DEMO_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.text.length).toBeGreaterThan(10);
    }
    expect(new Set(DEMO_PROMPTS.map(p => p.id)).size).toBe(DEMO_PROMPTS.length);  // unique ids
  });
});

describe('generateItineraryText', () => {
  const reply = (text) => ({ ok: true, json: async () => ({ content: [{ text }] }) });

  test('calls the API with the model + key and returns the prose', async () => {
    const fetchMock = jest.fn().mockResolvedValue(reply('Day 1: Tokyo\nMorning: Senso-ji.'));
    const out = await generateItineraryText('7-day Tokyo trip', { fetch: fetchMock, today: '2026-06-08' });
    expect(out).toMatch(/Senso-ji/);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-key');
    expect(JSON.parse(init.body).messages[0].content).toMatch(/Current date: 2026-06-08/);
  });

  test('returns null on a non-OK response and on empty input', async () => {
    expect(await generateItineraryText('x', { fetch: jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }) })).toBeNull();
    const fetchMock = jest.fn();
    expect(await generateItineraryText('  ', { fetch: fetchMock })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('buildDemoTrip — generate → extract → build', () => {
  test('generated prose flows through the real assembler into a trip', async () => {
    // Inject a canned generator + a canned extractor (the contract), so no network is used.
    const generate = async () => 'Day 1: Tokyo\nMorning: Senso-ji Temple.\nDay 2: Tokyo\nMorning: Meiji Shrine.';
    const extract = async () => ({ tripName: 'Tokyo demo', destination: 'Tokyo', days: [
      { date: '2026-07-01', city: 'Tokyo', items: [{ name: 'Senso-ji Temple', type: 'activity' }] },
      { date: '2026-07-02', city: 'Tokyo', items: [{ name: 'Meiji Shrine', type: 'activity' }] },
    ] });
    const res = await buildDemoTrip(useStore.getState(), '2-day Tokyo trip', { generate, extract });
    expect(res.source).toBe('ai');
    expect(res.generated).toMatch(/Senso-ji/);
    const t = useStore.getState().trips.find(x => x.id === res.trip.id);
    expect(t.name).toBe('Tokyo demo');
    expect(t.days).toHaveLength(2);
    expect(t.days[0].activities.every(a => a.city === 'Tokyo')).toBe(true);
  });

  test('null generation → null (no trip built)', async () => {
    const res = await buildDemoTrip(useStore.getState(), 'x', { generate: async () => null });
    expect(res).toBeNull();
  });
});
