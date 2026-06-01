/**
 * FamilyBudgetAgent.js
 *
 * SEQUENTIAL · no API call · VOYARA MOAT
 *
 * Computes a per-family expense breakdown from the planned itinerary.
 * No competitor does per-family cost splitting — this auto-populates the Splitwise tab.
 *
 * Formula per family:
 *   accommodation  = roomsNeeded × roomRate × nights
 *   transit        = transitCost × familyMemberCount
 *   activities     = activityCost × familyMemberCount
 *   meals          = mealCost × familyMemberCount
 *   buffer         = (accommodation + transit + activities + meals) × 0.12
 *   total          = sum + buffer
 *
 * Output:
 *   budgetByFamily[]  — per-family breakdown (for UI display)
 *   expenses[]        — Expense[] ready to push to Splitwise tab (source: 'itinerary')
 */

import { uid } from '../utils/helpers';

const BUFFER_PCT = 0.12; // 12% contingency buffer

// ─── Category helpers ─────────────────────────────────────────────────────────

function activityCategory(type) {
  switch (type) {
    case 'food':      return { icon: '🍽️', label: 'Meals' };
    case 'transport': return { icon: '✈️', label: 'Transit' };
    case 'stay':      return { icon: '🏨', label: 'Accommodation' };
    default:          return { icon: '🎯', label: 'Activities' };
  }
}

// ─── Agent ────────────────────────────────────────────────────────────────────

/**
 * run(trip, dayActivities, groupProfile) → BudgetResult
 *
 * BudgetResult: {
 *   budgetByFamily: FamilyBudget[]
 *   totalBudget:    number
 *   expenses:       Expense[]    ← ready for Splitwise (participatingFamilies set)
 *   summary:        string       ← human-readable for ItineraryAgent context
 * }
 *
 * FamilyBudget: {
 *   familyId, familyName, memberCount, roomsNeeded,
 *   accommodation, transit, activities, meals, buffer, total
 * }
 */
export function run(trip, dayActivities, groupProfile) {
  const families    = groupProfile.families;
  const nights      = (trip.days || []).length;
  const totalMembers = groupProfile.totalMembers || 1;

  if (!families || families.length === 0 || !dayActivities) {
    return { budgetByFamily: [], totalBudget: 0, expenses: [], summary: '' };
  }

  // ── Step 1: separate activity types across all days ────────────────────────
  const allActivities = (dayActivities || []).flatMap((dayActs, dayIdx) =>
    (dayActs || []).map(a => ({ ...a, dayIdx, dayLabel: trip.days[dayIdx]?.label || `Day ${dayIdx + 1}` }))
  );

  const stayActivities     = allActivities.filter(a => a.type === 'stay');
  const transitActivities  = allActivities.filter(a => a.type === 'transport');
  const mealActivities     = allActivities.filter(a => a.type === 'food');
  const activityActivities = allActivities.filter(a => a.type === 'activity');

  // ── Step 2: Accommodation cost — split by rooms, NOT equally per person ────
  // Each family pays for their own rooms × nights
  const totalStayCostPerRoom = stayActivities.reduce((s, a) => {
    // costPerPerson is stored as (roomRate / membersInRoom), so reverse it
    // We use groupProfile to get room rate
    return s + (a.costPerPerson * totalMembers / Math.max(groupProfile.totalRoomsNeeded, 1));
  }, 0);
  // Effective room rate per night
  const roomRatePerNight = nights > 0 ? totalStayCostPerRoom / nights : 0;

  // ── Step 3: Per-family cost breakdown ─────────────────────────────────────
  const budgetByFamily = families.map(family => {
    const memberCount  = family.memberCount || family.members?.length || 1;
    const memberShare  = memberCount / totalMembers;
    const roomsNeeded  = family.roomsNeeded || 1;
    const roomShare    = roomsNeeded / Math.max(groupProfile.totalRoomsNeeded, 1);

    // Accommodation: family pays for their own rooms
    const accommodation = roomRatePerNight * roomsNeeded * nights;

    // Transit, meals, activities: proportional to member count
    const transit    = transitActivities.reduce((s, a) => s + (a.costPerPerson * memberCount), 0);
    const meals      = mealActivities.reduce((s, a) => s + (a.costPerPerson * memberCount), 0);
    const activities = activityActivities.reduce((s, a) => s + (a.costPerPerson * memberCount), 0);

    const subtotal = accommodation + transit + meals + activities;
    const buffer   = Math.round(subtotal * BUFFER_PCT);
    const total    = subtotal + buffer;

    return {
      familyId:      family.id,
      familyName:    family.name,
      familyColor:   family.color,
      memberCount,
      roomsNeeded,
      accommodation: Math.round(accommodation),
      transit:       Math.round(transit),
      meals:         Math.round(meals),
      activities:    Math.round(activities),
      buffer,
      subtotal:      Math.round(subtotal),
      total:         Math.round(total),
    };
  });

  const totalBudget = budgetByFamily.reduce((s, f) => s + f.total, 0);

  // ── Step 4: Build Expense[] for Splitwise tab ─────────────────────────────
  // Creates one expense per activity per family, with participatingFamilies set correctly.
  // This means each family only pays for their share in the Splitwise split view.
  const expenses = [];

  // Group activities by type and create family-specific expenses
  const expenseGroups = [
    { label: 'Accommodation', icon: '🏨', acts: stayActivities,     source: 'accommodation' },
    { label: 'Transit',       icon: '✈️', acts: transitActivities,  source: 'transit' },
    { label: 'Meals',         icon: '🍽️', acts: mealActivities,     source: 'meals' },
    { label: 'Activities',    icon: '🎯', acts: activityActivities, source: 'activities' },
  ];

  // Payer defaults to first member of each family
  const familyPayerMap = {};
  trip.families.forEach(f => {
    familyPayerMap[f.id] = f.members[0]?.id || null;
  });

  allActivities
    .filter(a => (a.costPerPerson || 0) > 0)
    .forEach(act => {
      const { icon } = activityCategory(act.type);

      families.forEach(family => {
        const memberCount = family.memberCount || 1;
        let amount;

        if (act.type === 'stay') {
          // Accommodation: family pays for their rooms
          const roomShare = family.roomsNeeded / Math.max(groupProfile.totalRoomsNeeded, 1);
          amount = parseFloat((act.costPerPerson * totalMembers * roomShare).toFixed(2));
        } else {
          // Everything else: cost × family member count
          amount = parseFloat((act.costPerPerson * memberCount).toFixed(2));
        }

        if (amount <= 0) return;

        expenses.push({
          id:                     uid(),
          name:                   `${act.name} (${act.dayLabel})`,
          amount,
          estimatedAmount:        amount,
          category:               icon,
          paidBy:                 familyPayerMap[family.id],
          splitMode:              null,
          participatingFamilies:  [family.id],   // ← key: per-family, not split-all
          participatingMembers:   null,
          excluded:               false,
          source:                 'itinerary',
          activityId:             act.id,
          familyId:               family.id,     // extra field for FamilyBudget UI
        });
      });
    });

  // ── Step 5: Summary string for ItineraryAgent context ─────────────────────
  const summaryLines = budgetByFamily.map(f =>
    `  ${f.familyName} (${f.memberCount} people, ${f.roomsNeeded} room${f.roomsNeeded > 1 ? 's' : ''}): $${f.total.toLocaleString()} total (stay $${f.accommodation}, transit $${f.transit}, meals $${f.meals}, activities $${f.activities}, +12% buffer $${f.buffer})`
  );
  const summary = [
    `Per-family budget breakdown (${nights} nights, ${totalMembers} people total):`,
    ...summaryLines,
    `Grand total: $${totalBudget.toLocaleString()}`,
  ].join('\n');

  return { budgetByFamily, totalBudget, expenses, summary };
}
