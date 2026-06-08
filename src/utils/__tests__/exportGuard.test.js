/**
 * exportGuard.test.js — the PDF export re-entrancy guard. All three exports share one in-flight
 * flag via runExclusive, so a double-tap (or a second export while one is generating/sharing) is
 * IGNORED rather than racing two share sheets — the intermittent iOS crash the owner hit. We test
 * the guard contract directly (runExclusive) and confirm a real export releases the flag.
 */
import { exportTripAsPDF, exportDayAsPDF, exportSettlementAsPDF, _runExclusive, _isExporting } from '../exportPlan';

describe('PDF export re-entrancy guard', () => {
  test('a concurrent call is ignored while one is in flight, then the flag releases', async () => {
    expect(_isExporting()).toBe(false);

    let release;
    const first = _runExclusive(() => new Promise((r) => { release = r; }));   // holds the lock
    expect(_isExporting()).toBe(true);

    let secondRan = false;
    const second = await _runExclusive(async () => { secondRan = true; return 'SECOND'; });
    expect(second).toBeUndefined();   // ignored — never entered
    expect(secondRan).toBe(false);

    release('FIRST');
    expect(await first).toBe('FIRST');
    expect(_isExporting()).toBe(false);   // released → a later export can run
  });

  test('the lock releases even if the wrapped work throws', async () => {
    await expect(_runExclusive(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(_isExporting()).toBe(false);
  });

  test('real exports are no-ops without a trip and never strand the flag', async () => {
    await exportTripAsPDF(null);
    await exportDayAsPDF(null, null);
    await exportSettlementAsPDF(undefined);
    expect(_isExporting()).toBe(false);
  });
});
