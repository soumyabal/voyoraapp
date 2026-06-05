/**
 * itineraryConfig.test.js — locks the cross-table invariants of the itinerary lookup tables,
 * so a future typo (e.g. a night-plan option with no matching meta) fails loudly.
 */
import { DAY_SLOTS, SLOT_MEAL, MEAL_LABEL, NIGHT_PLAN_OPTIONS, NIGHT_PLAN_META, SEV_RANK } from '../itineraryConfig';

describe('itineraryConfig', () => {
  test('DAY_SLOTS tile the full day 0→1440 with no gaps or overlaps', () => {
    expect(DAY_SLOTS[0].range[0]).toBe(0);
    expect(DAY_SLOTS[DAY_SLOTS.length - 1].range[1]).toBe(1440);
    for (let i = 1; i < DAY_SLOTS.length; i++) {
      expect(DAY_SLOTS[i].range[0]).toBe(DAY_SLOTS[i - 1].range[1]);
    }
  });

  test('every SLOT_MEAL value resolves to a MEAL_LABEL entry', () => {
    Object.values(SLOT_MEAL).forEach((meal) => expect(MEAL_LABEL[meal]).toBeDefined());
  });

  test('NIGHT_PLAN_OPTIONS and NIGHT_PLAN_META cover exactly the same keys', () => {
    const opt = NIGHT_PLAN_OPTIONS.map((o) => o.key).sort();
    const meta = Object.keys(NIGHT_PLAN_META).sort();
    expect(opt).toEqual(meta);
  });

  test('SEV_RANK orders error < warning < info (errors sort first)', () => {
    expect(SEV_RANK.error).toBeLessThan(SEV_RANK.warning);
    expect(SEV_RANK.warning).toBeLessThan(SEV_RANK.info);
  });
});
