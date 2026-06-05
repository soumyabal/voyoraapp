/**
 * dietary.js — per-family dietary warning for a food activity.
 *
 * Pure: given a food activity and the trip's families, returns a soft warning string
 * ('⚠️ May contain meat' / '⚠️ Alcohol') when a family with that restriction might be
 * affected, else null. Word-boundary keyword match over the activity's name + detail.
 * Meat is checked before alcohol (a place can trip both).
 */
export const MEAT_WARN_RE = /\b(beef|pork|lamb|chicken|mutton|fish|prawn|shrimp|seafood|lobster|crab|sashimi|sushi|steak|burger|bbq|barbecue|bacon|ham|meat|non.?veg)\b/i;
export const ALCO_WARN_RE = /\b(beer|wine|cocktail|whisky|whiskey|vodka|rum|gin|spirits|alcohol|brewery|pub|bar|tavern|champagne|prosecco|sake)\b/i;

export function getDietaryWarning(act, families = []) {
  if (act.type !== 'food') return null;
  const text     = `${act.name} ${act.detail || ''}`;
  const vegFams  = families.filter(f => (f.dietary || []).some(d => d === 'vegetarian' || d === 'vegan'));
  const alcoFams = families.filter(f => (f.dietary || []).includes('no-alcohol'));
  if (vegFams.length > 0 && MEAT_WARN_RE.test(text)) return '⚠️ May contain meat';
  if (alcoFams.length > 0 && ALCO_WARN_RE.test(text)) return '⚠️ Alcohol';
  return null;
}
