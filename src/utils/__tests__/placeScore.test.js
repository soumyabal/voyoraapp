/**
 * placeScore.test.js — the deterministic ranking kernel. Pure scorer: base quality
 * + group-fit (♿ hard-filter, kids, dietary, interests, budget, distance).
 */
import { scorePlace, qualityScore } from '../placeScore';

const PLACE = (over = {}) => ({
  name: 'X', rating: 4.5, ratingCount: 1000, types: ['tourist_attraction'],
  activityType: 'activity', wheelchairOk: null, vegFriendly: false, costPerPerson: 20,
  lat: 40, lng: -80, ...over,
});

describe('quality kernel (profile-free)', () => {
  test('damped popularity: a proven 4.7 with thousands beats a 5.0 with 3 reviews', () => {
    const proven = PLACE({ rating: 4.7, ratingCount: 5000 });
    const shiny  = PLACE({ rating: 5.0, ratingCount: 3 });
    expect(qualityScore(proven)).toBeGreaterThan(qualityScore(shiny));
  });

  test('scorePlace with no profile === qualityScore (backward compatible)', () => {
    const p = PLACE();
    expect(scorePlace(p, null)).toBeCloseTo(qualityScore(p));
  });
});

describe('group-fit re-ranking', () => {
  test('wheelchair group HARD-excludes a known-inaccessible venue (-Infinity)', () => {
    const profile = { hasWheelchair: true };
    expect(scorePlace(PLACE({ wheelchairOk: false }), profile)).toBe(-Infinity);
    // unknown accessibility (null) is kept, not excluded
    expect(scorePlace(PLACE({ wheelchairOk: null }), profile)).toBeGreaterThan(-Infinity);
    // confirmed accessible gets a boost over the bare quality score
    expect(scorePlace(PLACE({ wheelchairOk: true }), profile))
      .toBeGreaterThan(qualityScore(PLACE({ wheelchairOk: true })));
  });

  test('kids present: a zoo outranks a same-quality bar (which is demoted)', () => {
    const profile = { hasKids: true };
    const zoo = PLACE({ types: ['zoo'] });
    const bar = PLACE({ types: ['bar'] });
    expect(scorePlace(zoo, profile)).toBeGreaterThan(scorePlace(bar, profile));
  });

  test('interest match lifts a place above an equal-quality non-match', () => {
    const profile = { interests: ['history'] };
    const hist = PLACE({ types: ['museum'] });          // tagged history
    const generic = PLACE({ types: ['point_of_interest'] });
    expect(scorePlace(hist, profile)).toBeGreaterThan(scorePlace(generic, profile));
  });

  test('vegetarian group: veg-friendly restaurant beats a non-veg one', () => {
    const profile = { vegetarianCount: 2 };
    const veg = PLACE({ activityType: 'food', types: ['restaurant'], vegFriendly: true });
    const non = PLACE({ activityType: 'food', types: ['restaurant'], vegFriendly: false });
    expect(scorePlace(veg, profile)).toBeGreaterThan(scorePlace(non, profile));
  });

  test('distance penalty only applies when a focus point is given', () => {
    const profile = { interests: [] };
    const near = PLACE({ lat: 40.0, lng: -80.0 });
    const far  = PLACE({ lat: 41.0, lng: -80.0 }); // ~111 km away
    const ctx  = { focusPoint: { lat: 40.0, lng: -80.0 } };
    expect(scorePlace(near, profile, ctx)).toBeGreaterThan(scorePlace(far, profile, ctx));
    // without a focus point, distance is ignored → equal
    expect(scorePlace(near, profile)).toBeCloseTo(scorePlace(far, profile));
  });
});
