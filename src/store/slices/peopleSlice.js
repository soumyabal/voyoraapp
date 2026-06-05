/**
 * peopleSlice — trip families/members + the global traveler library & groups.
 *
 * Part of the Zustand slices split: a `(set, get) => ({...actions})` factory
 * spread into the single persisted store in ../index.js. set/get operate on the
 * FULL merged store, so behaviour is identical to the former inline definitions.
 * Acts on trip.families[], the global `travelers`, and `groups` (state declared
 * in ../index.js).
 *
 * Gated by: splitDelete.regression (deleteTraveler/deleteFamily heir + balance),
 * store.test (createTrip families), TravelersScreen flows.
 */
import { uid, familyPalette } from '../../utils/helpers';

export const createPeopleSlice = (set, get) => ({
  // ── FAMILIES & TRAVELERS ─────────────────────────────────
  addFamily: (tripId, { name, members }) => set(s => {
    const trip = s.trips.find(t => t.id === tripId);
    const color = familyPalette[trip ? trip.families.length % familyPalette.length : 0];
    return {
      trips: s.trips.map(t => t.id !== tripId ? t : {
        ...t,
        families: [...t.families, {
          id: uid(), name, color,
          members: members.filter(m => m.name).map(m => ({ id: uid(), name: m.name, age: parseInt(m.age) || 25, needs: [] })),
        }],
      }),
    };
  }),

  // Like addFamily but preserves full member objects (travelerId, needs, etc.)
  addFamilyFull: (tripId, { name, members, color: c, groupId, dietary, wakeTime }) => set(s => {
    const trip = s.trips.find(t => t.id === tripId);
    const color = c || familyPalette[trip ? trip.families.length % familyPalette.length : 0];
    return {
      trips: s.trips.map(t => t.id !== tripId ? t : {
        ...t,
        families: [...t.families, {
          id: uid(), name, color, groupId: groupId || null,
          dietary: dietary || [],
          wakeTime: wakeTime || 'regular',
          members: members.map(m => ({ id: uid(), ...m })),
        }],
      }),
    };
  }),

  addTraveler: (tripId, famId, member) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      families: t.families.map(f => f.id !== famId ? f : {
        ...f, members: [...f.members, { ...member, id: uid() }],
      }),
    }),
  })),

  updateTripMember: (tripId, famId, memberId, updates) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      families: t.families.map(f => f.id !== famId ? f : {
        ...f,
        members: f.members.map(m => m.id !== memberId ? m : { ...m, ...updates }),
      }),
    }),
  })),

  deleteTraveler: (tripId, famId, memberId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const families = t.families.map(f => f.id !== famId ? f : {
        ...f, members: f.members.filter(m => m.id !== memberId),
      });
      // Keep the books balanced: if the removed person was a payer, the credit
      // must move to a live member or it vanishes from the ledger (Σ net ≠ 0).
      // The family's new head inherits it; if the family is now empty, the
      // first remaining member trip-wide does. Also scrub the id from any
      // participant list / custom share so it can't leak back in.
      const heir = families.find(f => f.id === famId)?.members[0]?.id
        || families.flatMap(f => f.members)[0]?.id || null;
      const expenses = t.expenses.map(e => {
        const next = { ...e };
        if (next.paidBy === memberId) next.paidBy = heir;
        if (Array.isArray(next.participatingMembers)) {
          const pm = next.participatingMembers.filter(id => id !== memberId);
          next.participatingMembers = pm.length ? pm : null;
        }
        if (next.customShares && memberId in next.customShares) {
          const cs = { ...next.customShares }; delete cs[memberId];
          next.customShares = cs;
        }
        return next;
      });
      return { ...t, families, expenses };
    }),
  })),

  updateFamily: (tripId, famId, updates) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      families: t.families.map(f => f.id !== famId ? f : { ...f, ...updates }),
    }),
  })),

  deleteFamily: (tripId, famId) => set(s => ({
    trips: s.trips.map(t => {
      if (t.id !== tripId) return t;
      const deadIds = new Set((t.families.find(f => f.id === famId)?.members || []).map(m => m.id));
      const families = t.families.filter(f => f.id !== famId);
      // Same balance rule as deleteTraveler: a payment held by anyone in the
      // removed family is re-homed to a surviving member; stale ids/shares are
      // scrubbed; an expense left with zero families is re-broadened to all
      // survivors rather than an empty list (which would silently leak).
      const heir = families.flatMap(f => f.members)[0]?.id || null;
      const expenses = t.expenses.map(e => {
        const next = { ...e };
        let pf = next.participatingFamilies
          ? next.participatingFamilies.filter(id => id !== famId)
          : null;
        if (Array.isArray(pf) && pf.length === 0) pf = families.length ? families.map(f => f.id) : null;
        next.participatingFamilies = pf;
        if (deadIds.has(next.paidBy)) next.paidBy = heir;
        if (Array.isArray(next.participatingMembers)) {
          const pm = next.participatingMembers.filter(id => !deadIds.has(id));
          next.participatingMembers = pm.length ? pm : null;
        }
        if (next.customShares) {
          const cs = { ...next.customShares };
          delete cs[famId];
          deadIds.forEach(id => delete cs[id]);
          next.customShares = cs;
        }
        return next;
      });
      return { ...t, families, expenses };
    }),
  })),

  // Move a member to index 0 of their family so they become the family head.
  // The head carries the family's full balance share in "By Group" split mode.
  setFamilyHead: (tripId, famId, memberId) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      families: t.families.map(f => {
        if (f.id !== famId) return f;
        const rest = f.members.filter(m => m.id !== memberId);
        const head = f.members.find(m => m.id === memberId);
        return head ? { ...f, members: [head, ...rest] } : f;
      }),
    }),
  })),

  // ── TRAVELER LIBRARY (global) ────────────────────────────
  // Layer 1: unique people with baseline preferences.
  // Trip members link to travelers via member.travelerId.

  createTraveler: (traveler) => set(s => ({
    travelers: [{ ...traveler, id: uid(), createdAt: new Date().toISOString().slice(0, 10) }, ...s.travelers],
  })),

  updateTraveler: (travelerId, updates) => set(s => ({
    travelers: s.travelers.map(tv => tv.id !== travelerId ? tv : { ...tv, ...updates }),
    // Cascade name change into linked trip members that haven't been overridden
    trips: updates.name
      ? s.trips.map(t => ({
          ...t,
          families: t.families.map(f => ({
            ...f,
            members: f.members.map(m =>
              m.travelerId === travelerId && !m._nameOverride
                ? { ...m, name: updates.name }
                : m
            ),
          })),
        }))
      : s.trips,
  })),

  deleteTravelerFromLibrary: (travelerId) => set(s => ({
    travelers: s.travelers.filter(tv => tv.id !== travelerId),
    // Unlink from trip members (member stays, just loses the FK)
    trips: s.trips.map(t => ({
      ...t,
      families: t.families.map(f => ({
        ...f,
        members: f.members.map(m =>
          m.travelerId === travelerId ? { ...m, travelerId: null } : m
        ),
      })),
    })),
    // Remove from any groups
    groups: s.groups.map(g => ({
      ...g, travelerIds: g.travelerIds.filter(id => id !== travelerId),
    })),
  })),

  // ── GROUPS (Layer 2: reusable collections) ───────────────
  createGroup: (group) => set(s => ({
    groups: [{ ...group, id: uid() }, ...s.groups],
  })),

  updateGroup: (groupId, updates) => set(s => ({
    groups: s.groups.map(g => g.id !== groupId ? g : { ...g, ...updates }),
  })),

  deleteGroup: (groupId) => set(s => ({
    groups: s.groups.filter(g => g.id !== groupId),
    // Unlink group from any trip families
    trips: s.trips.map(t => ({
      ...t,
      families: t.families.map(f =>
        f.groupId === groupId ? { ...f, groupId: null } : f
      ),
    })),
  })),

  addTravelerToGroup: (groupId, travelerId) => set(s => ({
    groups: s.groups.map(g =>
      g.id !== groupId || g.travelerIds.includes(travelerId)
        ? g
        : { ...g, travelerIds: [...g.travelerIds, travelerId] }
    ),
  })),

  removeTravelerFromGroup: (groupId, travelerId) => set(s => ({
    groups: s.groups.map(g =>
      g.id !== groupId ? g : { ...g, travelerIds: g.travelerIds.filter(id => id !== travelerId) }
    ),
  })),

  // ── ADD GROUP TO TRIP (Layer 3) ──────────────────────────
  // Creates a trip family from a saved group, only including selectedTravelerIds.
  addGroupToTrip: (tripId, groupId, selectedTravelerIds) => set(s => {
    const group = s.groups.find(g => g.id === groupId);
    if (!group) return s;
    const trip = s.trips.find(t => t.id === tripId);
    if (!trip) return s;

    const members = selectedTravelerIds
      .map(tvId => s.travelers.find(tv => tv.id === tvId))
      .filter(Boolean)
      .map(tv => ({
        id: uid(),
        travelerId: tv.id,
        name: tv.name,
        age: tv.age || 25,
        needs: [...(tv.needs || [])],
      }));

    const newFamily = {
      id: uid(),
      groupId,
      name: group.name,
      color: group.color,
      members,
    };

    return {
      trips: s.trips.map(t => t.id !== tripId ? t : {
        ...t, families: [...t.families, newFamily],
      }),
    };
  }),

  // ── TRIP-SPECIFIC MEMBER OVERRIDES ───────────────────────
  // Sparse overrides let a traveler's preferences differ per trip
  // without mutating their global record.
  setMemberOverride: (tripId, famId, memberId, overrides) => set(s => ({
    trips: s.trips.map(t => t.id !== tripId ? t : {
      ...t,
      families: t.families.map(f => f.id !== famId ? f : {
        ...f,
        members: f.members.map(m => m.id !== memberId ? m : {
          ...m,
          ...overrides,
          _nameOverride: overrides.name !== undefined ? true : m._nameOverride,
        }),
      }),
    }),
  })),
});
