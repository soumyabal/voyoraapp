/**
 * dietary.test.js — getDietaryWarning: a food activity + families → soft warning | null.
 */
import { getDietaryWarning } from '../dietary';

const veg = { dietary: ['vegetarian'] };
const vegan = { dietary: ['vegan'] };
const noAlc = { dietary: ['no-alcohol'] };
const none = { dietary: [] };
const food = (name, detail) => ({ type: 'food', name, detail });

describe('getDietaryWarning', () => {
  test('non-food activity → null (even with meat in the name)', () => {
    expect(getDietaryWarning({ type: 'activity', name: 'Steak House' }, [veg])).toBeNull();
  });

  test('veg/vegan family + a meat keyword → meat warning', () => {
    expect(getDietaryWarning(food('Steak House'), [veg])).toBe('⚠️ May contain meat');
    expect(getDietaryWarning(food('Sushi Bar'), [vegan])).toBe('⚠️ May contain meat');
    expect(getDietaryWarning(food('Fresh Seafood Grill'), [veg])).toBe('⚠️ May contain meat');
  });

  test('no veg family → no meat warning even with meat', () => {
    expect(getDietaryWarning(food('Steak House'), [none, noAlc])).toBeNull();
  });

  test('no-alcohol family + an alcohol keyword → alcohol warning', () => {
    expect(getDietaryWarning(food('Rooftop Brewery'), [noAlc])).toBe('⚠️ Alcohol');
    expect(getDietaryWarning(food('Wine Tasting'), [noAlc])).toBe('⚠️ Alcohol');
  });

  test('veg family + a salad → null', () => {
    expect(getDietaryWarning(food('Green Salad Cafe'), [veg])).toBeNull();
  });

  test('meat is checked before alcohol when a place trips both', () => {
    const both = { dietary: ['vegetarian', 'no-alcohol'] };
    expect(getDietaryWarning(food('Steak & Wine Bar'), [both])).toBe('⚠️ May contain meat');
  });

  test('empty families → null', () => {
    expect(getDietaryWarning(food('Steak House'), [])).toBeNull();
  });

  test('the detail field is searched too', () => {
    expect(getDietaryWarning(food('Hidden Diner', 'famous for its bacon'), [veg])).toBe('⚠️ May contain meat');
  });
});
