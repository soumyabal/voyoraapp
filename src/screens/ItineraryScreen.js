/* eslint-disable react-hooks/refs, react-hooks/purity -- two false positives only:
   showUndoAction stamps a Snackbar nonce with Date.now() inside a handler (purity), and the
   night-plan onPress closure reaches a ref via pickNightPlan→showUndoAction (refs). Both run on
   press, never during render; the compiler is OFF and can't see that. Keep new logic clean —
   this is not a license to read refs in render here. */
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Dimensions, Alert, Linking, Modal, Share, Image, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import DiscoverModal from '../modals/DiscoverModal';
import SetOriginModal from '../modals/SetOriginModal';
import PlayTripModal from '../modals/PlayTripModal';
import { colors, spacing, radius, typography, shadow, activityColors } from '../theme';
import Icon from '../components/ui/Icon';
import Snackbar from '../components/ui/Snackbar';
import ConfettiBurst from '../components/ui/ConfettiBurst';
import { fmt, fmtM, uid, checkOutOf, resolveDayZones, pastActivityIds, isDayInPast, planFloorMin, crossZoneLeg } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcFamilyItineraryCost } from '../utils/costs';
import { estimateDuration, formatDuration, lodgingForNight, dayStartAnchor, nightCityFor } from '../utils/tripValidator';
import { googleMapsDayUrl } from '../utils/mapsRoute';
import { planDay, returnJourneyDraft, suggestDayForVenue } from '../utils/autoArrange';
import { travelLeg, formatMi } from '../utils/geo';
import { weekdayOf, hoursLabel, weeklyHoursLabel, dayIntervals } from '../utils/hours';
import { refreshPhotoKey } from '../utils/places';
import { getSuggestedTime, minToTime, getSlotKey, timeToMin } from '../utils/slots';
import { getDietaryWarning } from '../utils/dietary';
import { generateDayShareText } from '../utils/dayShare';
import { computeTripHealth } from '../utils/tripHealth';
import { tripCheckStatus } from '../utils/tripCheckStatus';
import { DAY_SLOTS, ACT_ICON, SEV_RANK, DAY_PILL, HEALTH_DOT, NIGHT_PLAN_OPTIONS, NIGHT_PLAN_META } from '../utils/itineraryConfig';
import { bookingUrl } from '../utils/booking';
import { exportDayAsPDF } from '../utils/exportPlan';
import LocationSearchField from '../components/ui/LocationSearchField';

const SCREEN_W       = Dimensions.get('window').width;
const CARD_ACTIONS_W = 216;                        // Move · Delete action buttons
const CARD_W         = SCREEN_W - 48;              // SCREEN_W - 2 × spacing.xxl (24)
const WD_SHORT       = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];  // weekdayOf() → label

// Static lookup tables (day slots, icons, pill tones, meal map, night-plan options/meta)
// now live in utils/itineraryConfig — imported at the top of this file.

// ── Travel leg between two consecutive stops ──────────────────────
// The intuitive distance cue: a little "🚗 12 min · 3.1 mi" connector between
// cards (Wanderlog/Google-Trips style). Turns RED when the next stop starts
// before you could realistically get there — the same call the Trip Check rule
// makes, so the inline cue and the warning always agree.
function TravelConnector({ from, to }) {
  // The drive IS the travel — never draw a leg INTO or OUT OF a transport stop.
  // Otherwise a lighthouse → "Drive home to Buffalo Grove" pair renders the whole
  // drive as a bogus "341 min to reach the drive" + a false "only 4 min gap". This
  // matches Trip Check Rule 1b, so the inline cue and the warning agree.
  if (from.type === 'transport' || to.type === 'transport') return null;
  const leg = travelLeg(from, to);
  if (!leg || leg.min < 3) return null;            // unknown coords or a trivial hop
  const gap   = timeToMin(to.time) - (timeToMin(from.time) + estimateDuration(from));
  const tight = leg.min >= 10 && gap < leg.min;    // not enough time to travel (close OR overlapping)
  const gapNote = !tight ? '' : gap < 0 ? ' — overlaps' : ` — only ${gap} min gap`;
  return (
    <View style={styles.legRow}>
      <View style={[styles.legDot, tight && styles.legDotTight]} />
      <Text style={[styles.legText, tight && styles.legTextTight]} numberOfLines={1}>
        {leg.mode === 'walk' ? '🚶' : '🚗'} {leg.min} min · {formatMi(leg.km)}{gapNote}
      </Text>
    </View>
  );
}

// The drive estimate uses a city door-to-door speed (geo.js DRIVE_KMH = 26), so past
// ~one metro area the minutes balloon into nonsense (a 215 km hop computes ~10 h, not
// the real ~3 h highway run). Beyond this we show the RELIABLE straight-line distance
// only — no fabricated time. The distance (haversine) is trustworthy at any range.
const ORIGIN_FAR_KM = 60;

// ── Origin leg: from the trip's starting point into Day 1's first stop ────────
// The one place the normal between-stops connector can't reach (nothing precedes
// stop 1). Informational only — never red. `origin` = trip.origin {label,lat,lng}.
function OriginConnector({ origin, to }) {
  const leg = travelLeg(origin, to);
  if (!leg) return null;                         // origin or first stop missing coords
  const farAway = leg.km > ORIGIN_FAR_KM;        // city-speed time estimate no longer believable
  return (
    <View style={styles.legRow}>
      <View style={styles.legDot} />
      <Text style={styles.legText} numberOfLines={1}>
        {farAway
          ? `🧭 ${formatMi(leg.km)} to your first stop`
          : `${leg.mode === 'walk' ? '🚶' : '🚗'} ${leg.min} min · ${formatMi(leg.km)} to your first stop`}
      </Text>
    </View>
  );
}

// ── Robinhood-style expense chart ─────────────────────────────────
function TripExpenseChart({ trip, currentDay, onSelectDay, compact }) {
  const dayCosts = trip.days.map(d => calcDayCostForTrip(d, trip));
  const maxCost = Math.max(...dayCosts, 1);
  const total = dayCosts.reduce((s, c) => s + c, 0);
  const chartW = SCREEN_W - spacing.xxl * 2 - 32; // account for banner padding
  const barCount = trip.days.length;
  const gap = Math.min(4, Math.floor((chartW - barCount * 6) / Math.max(barCount - 1, 1)));
  const barW = Math.max(6, Math.floor((chartW - gap * (barCount - 1)) / barCount));
  const chartH = 72;

  if (barCount === 0) return null;

  return (
    <View style={compact ? ch.wrapCompact : ch.wrap}>
      {/* Header row */}
      <View style={ch.headerRow}>
        <View>
          <Text style={ch.label}>SPEND BY DAY</Text>
          {total > 0 && <Text style={ch.totalLine}>{fmtM(total)} total</Text>}
        </View>
        {total === 0 && <Text style={ch.emptyHint}>Add activities to see chart</Text>}
      </View>

      {/* Bar chart */}
      <View style={[ch.chartArea, { height: chartH }]}>
        {trip.days.map((d, i) => {
          const cost = dayCosts[i];
          const heightPct = cost > 0 ? Math.max(0.08, cost / maxCost) : 0.04;
          const barH = Math.round(chartH * heightPct);
          const isActive = i === currentDay;
          return (
            <TouchableOpacity
              key={d.date}
              activeOpacity={0.7}
              onPress={() => onSelectDay(i)}
              style={[
                ch.barWrapper,
                { width: barW, marginRight: i < barCount - 1 ? gap : 0 },
              ]}
            >
              {/* Top label (active only) */}
              {isActive && cost > 0 && (
                <Text style={ch.barLabel}>{fmtM(cost)}</Text>
              )}
              {/* Spacer pushes bar to bottom */}
              <View style={{ flex: 1 }} />
              {/* Bar */}
              <View
                style={[
                  ch.bar,
                  {
                    height: barH,
                    width: barW,
                    backgroundColor: isActive
                      ? colors.green
                      : cost === 0
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255,255,255,0.22)',
                    borderRadius: barW < 10 ? 2 : 4,
                  },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Day labels */}
      <View style={ch.dayLabels}>
        {trip.days.map((d, i) => {
          const isActive = i === currentDay;
          const show = i === 0 || i === trip.days.length - 1 || isActive || i % 5 === 0;
          return (
            <View key={d.date} style={{ width: barW, marginRight: i < barCount - 1 ? gap : 0 }}>
              {show && (
                <Text
                  style={[ch.dayLabelText, isActive && ch.dayLabelActive]}
                  numberOfLines={1}
                >
                  {i + 1}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}


// ── Option D: Sticky Mini-Header ─────────────────────────────────
// Always visible above the ScrollView — never scrolls away.
// Left:   TRIP $X,XXX
// Right:  Day N  $XXX  $XX/p
// ⓘ tap: slide-up detail sheet (family totals, chart, push button)
function StickyHeader({ trip, currentDay, onSelectDay, onPush, onCheckTrip, onResetDay, onResetAll, onPlayTrip }) {
  const [showDetail, setShowDetail] = useState(false);
  const itinTotal = calcTripItineraryTotal(trip);
  const day     = trip.days[currentDay];

  const handleShare = async () => {
    try {
      const text = generateDayShareText(trip, day, currentDay);
      await Share.share({ message: text });
    } catch (e) {
      console.warn('[share]', e);
    }
  };

  return (
    <>
      {/* ── Sticky bar ── */}
      <View style={ch.stickyBar}>
        {/* Trip total — the headline number for the whole trip (owner's call: total on
            top, not the day). Per-day cost lives in the day pills + the ⓘ sheet. */}
        <View style={ch.miniDayBlock}>
          <Text style={ch.miniTripLabel} numberOfLines={1}>TRIP TOTAL</Text>
          <Text style={ch.miniDayAmt} numberOfLines={1}>{itinTotal > 0 ? fmtM(itinTotal) : '—'}</Text>
        </View>

        {/* Trip Check — always here so the planner sees how the trip's looking + can open the
            full checker. Calm by default: a thin green ✓ when all's well (an outline, not a
            green block), neutral while still building, amber with a count when there's
            something to look at. The single deliberate trip-health signal; the day pills stay
            calm and only dot a day that needs attention. */}
        {!!onCheckTrip && (() => {
          const { conflicts, checks, state } = tripCheckStatus(trip);

          let v, label;
          if (state === 'fix') {
            v = { icon: 'warning-outline', text: `${conflicts}`, bg: colors.warn, fg: '#fff' };
            label = `Trip check: ${conflicts} to fix`;
          } else if (state === 'look') {
            v = { icon: 'information-circle-outline', text: `${checks}`, bg: 'rgba(224,154,55,0.22)', fg: '#f0b25e' };
            label = `Trip check: ${checks} to look at`;
          } else if (state === 'building') {
            v = { icon: 'more', text: '', bg: 'rgba(255,255,255,0.12)', fg: 'rgba(255,255,255,0.85)' };
            label = 'Trip check: still building';
          } else {
            v = { icon: 'checkmark-circle', text: '', bg: 'transparent', fg: colors.success, border: colors.success };
            label = 'Trip check: all clear';
          }
          return (
            <TouchableOpacity
              style={[ch.checkChip, { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1.5 : 0 }]}
              onPress={onCheckTrip}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon name={v.icon} size={13} color={v.fg} />
              {!!v.text && <Text style={[ch.checkChipText, { color: v.fg }]}>{v.text}</Text>}
            </TouchableOpacity>
          );
        })()}

        {/* ▶ Play my trip — watch the trip come to life as you plan (a motivator, not a share) */}
        <TouchableOpacity style={ch.shareBtn} onPress={onPlayTrip} activeOpacity={0.7} accessibilityLabel="Play my trip">
          <Icon name="play" size={15} color="#fff" />
        </TouchableOpacity>

        {/* Share day */}
        <TouchableOpacity style={ch.shareBtn} onPress={handleShare} activeOpacity={0.7}>
          <Icon name="share-social-outline" size={15} color="#fff" />
        </TouchableOpacity>

        {/* Detail trigger */}
        <TouchableOpacity style={ch.infoBtn} onPress={() => setShowDetail(true)} activeOpacity={0.7}>
          <Icon name="information-circle-outline" size={16} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Detail sheet (slide-up Modal) ── */}
      <Modal
        visible={showDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDetail(false)}
      >
        <TouchableOpacity
          style={ch.overlay}
          activeOpacity={1}
          onPress={() => setShowDetail(false)}
        >
          {/* onStartShouldSetResponder stops touches on the sheet closing the overlay */}
          <View style={ch.sheet} onStartShouldSetResponder={() => true}>
            {/* Handle + header */}
            <View style={ch.sheetHandle} />
            <View style={ch.sheetHeader}>
              <Text style={ch.sheetTitle}>Trip Overview</Text>
              <TouchableOpacity onPress={() => setShowDetail(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={ch.sheetClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Trip summary line */}
            <View style={ch.sheetSummary}>
              <Text style={ch.sheetTotalAmt}>{fmtM(itinTotal)}</Text>
              <Text style={ch.sheetTotalSub}>
                {trip.families.reduce((s, f) => s + f.members.length, 0)} travellers · {trip.days.length} days
              </Text>
            </View>

            <View style={ch.sheetDivider} />

            {/* Family totals */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={ch.famRow}>
                {trip.families.map(fam => {
                  const fc = calcFamilyItineraryCost(fam, trip);
                  return (
                    <View key={fam.id} style={ch.famCol}>
                      <Text style={[ch.famName, { color: fam.color }]}>{fam.name.split(' ')[0]}</Text>
                      <Text style={ch.famAmt}>{fmtM(fc)}</Text>
                      <Text style={ch.famSub}>{fam.members.length}p</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            <View style={ch.sheetDivider} />

            {/* Spend by day chart */}
            <TripExpenseChart
              trip={trip}
              currentDay={currentDay}
              compact
              onSelectDay={v => { onSelectDay(v); setShowDetail(false); }}
            />

            {/* Push / synced */}
            {/* Export day as PDF */}
            <TouchableOpacity
              style={ch.exportDayBtn}
              onPress={() => { setShowDetail(false); exportDayAsPDF(trip, day, currentDay); }}
              activeOpacity={0.8}
            >
              <Text style={ch.exportDayBtnText}>📄 Export Day as PDF</Text>
            </TouchableOpacity>

            {trip.itineraryPushed ? (
              <View style={ch.syncedBadge}>
                <Text style={ch.syncedText}>✅ Synced to Splitwise — edits update automatically</Text>
              </View>
            ) : (
              <TouchableOpacity style={ch.pushBtn} onPress={() => { onPush(); setShowDetail(false); }}>
                <Text style={ch.pushBtnText}>➡️ Move to Splitwise</Text>
              </TouchableOpacity>
            )}

            {/* Reset — start the plan over (one day, or the whole trip) */}
            {(!!onResetDay || !!onResetAll) && (
              <>
                <View style={ch.sheetDivider} />
                <Text style={ch.resetLabel}>RESET PLAN</Text>
                <View style={ch.resetRow}>
                  {!!onResetDay && (
                    <TouchableOpacity style={ch.resetBtn} onPress={() => { setShowDetail(false); onResetDay(); }} activeOpacity={0.8}>
                      <Text style={ch.resetBtnText}>↺ Clear {trip.days[currentDay]?.label || 'this day'}</Text>
                    </TouchableOpacity>
                  )}
                  {!!onResetAll && (
                    <TouchableOpacity style={[ch.resetBtn, ch.resetBtnAll]} onPress={() => { setShowDetail(false); onResetAll(); }} activeOpacity={0.8}>
                      <Text style={[ch.resetBtnText, ch.resetBtnTextAll]}>↺ Clear all days</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function ItineraryScreen({ trip, switchTab, onPlanWithAI, onCheckTrip, highlightedActIds = [] }) {
  const { currentDay, setCurrentDay, addActivity, deleteActivity, updateActivity, pushItineraryToSplitwise, markActivityStatus, moveActivity, reorderSlotActivities, setDayActivities, resetDayActivities, resetAllActivities, restoreTripState, markPlanDayNoteSeen, setNightPlan, toggleActivityLock, ignoreWarning } = useStore();
  const [showPlayTrip,          setShowPlayTrip]          = useState(false);
  const [showAddActivity,       setShowAddActivity]       = useState(false);
  const [editActivity,          setEditActivity]          = useState(null);
  const [manualSeed,            setManualSeed]            = useState(null);   // {name?,address?,lat?,lng?,tile?} prefill when manual is opened from the Discover bridge / a dropped pin
  const [defaultSlotTime,       setDefaultSlotTime]       = useState('09:00');
  const [showDiscover,          setShowDiscover]          = useState(false);
  const [nightPlanDay,          setNightPlanDay]          = useState(null);  // dayIndex whose "how's tonight handled?" sheet is open
  const [discoverNear,          setDiscoverNear]          = useState(null);  // {lat,lng,label} when opened from an activity
  const [discoverCity,          setDiscoverCity]          = useState(null);  // city to open Discover in (e.g. booking a night's stay)
  const [discoverStayOnly,      setDiscoverStayOnly]      = useState(false); // open Discover filtered to hotels (booking a night)
  const [discoverSlot,          setDiscoverSlot]          = useState(null);  // slot key when Discover opened from a per-slot "+ Add"
  const [showOrigin,            setShowOrigin]            = useState(false); // SetOriginModal (Day-1 starting point)
  const [movingAct,             setMovingAct]             = useState(null);
  const [snack,                 setSnack]                 = useState(null);  // undo toast
  const snackTimer = useRef(null);
  useEffect(() => () => clearTimeout(snackTimer.current), []);

  // Scroll-to-highlight: when a card is highlighted (opened from the Split tab or Trip
  // Check), scroll the day so the row is actually in view — not just highlighted off-screen.
  // rowRefs maps actId → its wrapping View; we measure that against the scroll view + scrollTo.
  const scrollRef = useRef(null);
  const scrollYRef = useRef(0);          // live scroll offset (from onScroll)
  const rowRefs = useRef({});
  useEffect(() => {
    const id = highlightedActIds[0];
    if (!id) return undefined;
    const t = setTimeout(() => {
      const node = rowRefs.current[id];
      const sc = scrollRef.current;
      const scrollHost = sc?.getNativeScrollRef?.();
      if (!node?.measure || !scrollHost?.measure || !sc) return;
      // .measure gives absolute (page) coords on both old + new architecture — no
      // findNodeHandle/measureLayout (which Fabric rejects). Row's page-Y minus the scroll
      // viewport's page-Y, plus the current offset, is the row's Y in the scroll content.
      scrollHost.measure((sx, sy, sw, sh, scPageX, scPageY) => {
        node.measure((x, y, w, h, rowPageX, rowPageY) => {
          // Leave room for the pinned day-nav bar at the top of the viewport (~150px).
          const target = scrollYRef.current + (rowPageY - scPageY) - 150;
          sc.scrollTo({ y: Math.max(0, target), animated: true });
        });
      });
    }, 350);   // let the tab become visible (display:flex) + lay out first
    return () => clearTimeout(t);
  }, [highlightedActIds, currentDay]);
  const [mustDosDismissed,      setMustDosDismissed]      = useState(false);
  const [mustDosChecked,        setMustDosChecked]        = useState({});
  const [celebrate,             setCelebrate]             = useState(false);  // one-shot when Trip Check turns all-green

  // The effective day index: clamp a stale/out-of-range currentDay (e.g. switching to another
  // trip that has FEWER days than the day you were on) to a valid one. EVERY per-day derivation
  // below must use dayIdx — not the raw currentDay — or the rendered day and its zone/past/warning
  // data fall out of sync (the "2nd trip shows no EDT/CDT" bug: day fell back to 0 while the zone
  // memo still computed for the out-of-range index). The effect re-syncs the store so the
  // interaction handlers (which write via currentDay) target the same day.
  const dayIdx = trip.days[currentDay] ? currentDay : 0;
  const day = trip.days[dayIdx];
  useEffect(() => {
    if (currentDay !== dayIdx) setCurrentDay(dayIdx);
  }, [currentDay, dayIdx, setCurrentDay]);

  // Phase-1 planner: no live "today / active day" tracking inside a trip — you pick any day
  // and plan it. (Active trips are surfaced on the Home screen instead.)

  // Where you woke today (Day 1 → origin; else last night's hotel / friends-camping
  // address / home). Drives the first-stop travel leg for ANY day, not just Day 1.
  const startAnchor = day ? dayStartAnchor(trip, dayIdx) : null;
  // A located night (friends/camping) with NO address yet → we can't map the morning;
  // offer to add it instead of silently dropping the first leg.
  const priorNight = (day && currentDay > 0) ? lodgingForNight(trip, currentDay - 1) : null;
  const priorNightNeedsAddr = !startAnchor && !!priorNight?.nightPlan
    && ['with_friends', 'camping'].includes(priorNight.nightPlan.type)
    && priorNight.nightPlan.lat == null;

  // Backfill place photos for this day's stops that don't have one yet (added
  // before we stored photos / via the AI planner), so the cards show a thumbnail.
  // One cached Places lookup per place; guarded so we never refetch.
  // NOTE: per-stop place-photo backfill was removed to stop recurring Google
  // Places API spend (each stored photo URL re-billed on every render, and
  // photoless stops re-ran a Text Search every session). Itinerary cards fall
  // back to type icons. A future, ToS-aligned option is a short-lived (≤30-day)
  // attributed in-app cache — never embedded into shared exports. (git history
  // has the original backfill if we revisit.)

  // Trip Check, computed ONCE: warnings grouped per day + each day's health level (drives
  // the calm day-pill dots — a pill only gets a dot when a day needs attention).
  const { healthByDay, warningsByDay } = React.useMemo(() => computeTripHealth(trip), [trip]);

  // Celebrate the earned moment: when Trip Check transitions to all-green (every day planned &
  // nothing flagged), fire a one-shot confetti burst. Only on a TRANSITION — never on open
  // (prev starts null), so an already-clean trip doesn't celebrate every time you visit.
  const tripCheckState = React.useMemo(() => tripCheckStatus(trip).state, [trip]);
  const prevCheckState = React.useRef(null);
  React.useEffect(() => {
    if (prevCheckState.current && prevCheckState.current !== 'clear' && tripCheckState === 'clear') {
      setCelebrate(true);
    }
    prevCheckState.current = tripCheckState;
  }, [tripCheckState]);

  // This day's warnings (re-sliced cheaply when the day changes; no extra validateTrip call).
  const dayWarnings = React.useMemo(
    () => (warningsByDay[dayIdx] || []).slice().sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]),
    [warningsByDay, dayIdx]
  );

  // Per-day timezone resolution: a single day badge for a one-zone day, or per-activity zone
  // tags when the day spans zones (a travel day). Drives both the header chip + the card eyebrows.
  const dayZones = React.useMemo(() => resolveDayZones(trip, dayIdx), [trip, dayIdx]);

  // Clock-aware locking (TZ): on a live trip, a stop whose local start has passed is auto-locked
  // (can't be moved without a warning) and Plan-my-day only arranges the remaining time. Date.now()
  // is read at render so it stays current as the day progresses (re-read on each interaction).
  const nowMs = Date.now();
  const pastIds = React.useMemo(() => pastActivityIds(trip, dayIdx, nowMs), [trip, dayIdx, nowMs]);
  const dayPast = React.useMemo(() => isDayInPast(trip, dayIdx, nowMs), [trip, dayIdx, nowMs]);

  const handlePush = () => { pushItineraryToSplitwise(trip.id); switchTab('splitwise'); };

  const openEdit       = (act)  => { setEditActivity(act); setShowAddActivity(true); };
  // Manual editor — the deliberate "enter your own" path (transport, custom, per-family
  // cost). `seed` ({name?,address?,lat?,lng?,tile?}) prefills it — used by the Discover
  // "add manually" bridge (name) and a dropped map pin (lat/lng → Stay default).
  const openManual     = (seed = null, time = '09:00') => { setManualSeed(seed); setDefaultSlotTime(time); setEditActivity(null); setShowAddActivity(true); };
  const openAdd        = ()     => openManual(null, '09:00');
  // Per-slot "+ Add" is now SEARCH-FIRST: it opens Discover scoped to that slot
  // (manual is one tap away via the header button / the Discover "add manually" bridge).
  const openAddInSlot  = (time) => { setDiscoverNear(null); setDiscoverStayOnly(false); setDiscoverSlot(getSlotKey(time)); setDefaultSlotTime(time); setShowDiscover(true); };

  // Move an UNSCHEDULED (didn't-fit-its-hours) stop to another day, landing it at an
  // in-hours time there so it arrives scheduled — not dropped into that day's tray too.
  const moveUnfitTo = (act, dayIdx) => {
    moveActivity(trip.id, currentDay, dayIdx, act.id);
    const need    = estimateDuration(act);
    const openMin = (dayIntervals(act.openHours, weekdayOf(trip.days[dayIdx]?.date)) || [])[0]?.o;
    const slotKey = getSlotKey(openMin != null ? minToTime(openMin) : '10:00');
    updateActivity(trip.id, act.id, { time: getSuggestedTime(trip, dayIdx, slotKey, need, act.openHours) });
  };
  // Keep an unscheduled (didn't-fit-hours) stop on THIS day anyway — give it a time (its open
  // hour today, else noon) so it leaves the "doesn't fit" tray and becomes a normal card. The
  // user accepts the imperfect fit; Trip Check notes it softly. Undo restores it to unscheduled.
  const keepOnDay = (act) => {
    const d = trip.days[currentDay];
    const iv = dayIntervals(act.openHours, weekdayOf(d?.date));
    const start = (iv && iv.length) ? iv[0].o : 12 * 60;
    updateActivity(trip.id, act.id, { time: minToTime(start) });
    showUndoAction(`Kept ${(act.name || 'stop').slice(0, 24)} on ${d?.label || 'this day'}`, 'checkmark-circle',
      () => updateActivity(trip.id, act.id, { time: null }));
  };

  // ── "How's tonight handled?" — resolve a hotel-less night politely ──────────
  const openNightPlan = (dayIdx) => setNightPlanDay(dayIdx);
  const closeNightPlan = () => {
    const idx = nightPlanDay;
    const plan = idx != null ? trip.days?.[idx]?.nightPlan : null;
    setNightPlanDay(null);
    if (plan?.type) showUndoAction(
      plan.lat != null ? 'Mapped — your morning drive is set 📍' : "Got it — tonight's handled",
      NIGHT_PLAN_META[plan.type]?.icon || 'location',
      () => setNightPlan(trip.id, idx, null),
    );
  };
  const pickNightPlan = (key) => {
    const idx = nightPlanDay;
    if (idx == null) return;
    if (!key) { setNightPlan(trip.id, idx, null); setNightPlanDay(null); return; }  // clear / flag again
    const prev = trip.days?.[idx]?.nightPlan;
    // Keep a captured address if re-picking the SAME reason; else start fresh.
    setNightPlan(trip.id, idx, prev?.type === key ? prev : { type: key });
    // Located reasons keep the sheet open so the optional address field can show;
    // the rest are a one-tap answer → close + acknowledge.
    if (!NIGHT_PLAN_OPTIONS.find(o => o.key === key)?.located) {
      setNightPlanDay(null);
      showUndoAction("Got it — tonight's handled", NIGHT_PLAN_META[key].icon, () => setNightPlan(trip.id, idx, null));
    }
  };
  // Optional address for a located night → merges coords into the night-plan object.
  const setNightAddress = (label, coords) => {
    const idx = nightPlanDay;
    if (idx == null) return;
    const cur = trip.days?.[idx]?.nightPlan;
    if (!cur?.type) return;
    setNightPlan(trip.id, idx, { type: cur.type, label, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) });
  };
  const addHotelFromNightPlan = () => {
    // Open Discover in the CITY you sleep in that night (St. Louis on Day 1), not the trip's
    // headline city (Mackinac) — so booking a multi-state road trip's nights starts in the right place.
    const idx = nightPlanDay;
    setNightPlanDay(null);
    setDiscoverNear(null);
    setDiscoverCity(idx != null ? nightCityFor(trip, idx) : null);
    setDiscoverStayOnly(true);   // booking a night → open straight to hotels
    setDiscoverSlot(null);
    setShowDiscover(true);
  };
  const closeModal     = ()     => { setShowAddActivity(false); setEditActivity(null); };
  // Open Discover's map centred on an activity → "what's around this place?".
  // Pass the place's own details so Discover can show IT (the search often won't
  // return a niche stop) as a real pin + selected card, not a blank anchor.
  const exploreNearby  = (act)  => {
    if (act?.lat == null || act?.lng == null) return;
    setDiscoverNear({
      lat: act.lat, lng: act.lng, label: act.name,
      rating: act.rating ?? null, address: act.address || '', url: act.url || '',
      openHours: act.openHours ?? null, type: act.type, photo: act.photo ?? null,
    });
    setDiscoverStayOnly(false);
    setShowDiscover(true);
  };

  // Show an undo toast after a status change; rolls back to the prior status.
  const showUndo = (message, icon, actId, prevStatus) => {
    clearTimeout(snackTimer.current);
    setSnack({ message, icon, actId, prevStatus, nonce: Date.now() });
    snackTimer.current = setTimeout(() => setSnack(null), 4500);
  };
  const undoStatus = () => {
    if (!snack) return;
    clearTimeout(snackTimer.current);
    if (snack.undo) snack.undo();
    else markActivityStatus(trip.id, snack.actId, snack.prevStatus);
    setSnack(null);
  };
  // Generic undo toast (e.g. Auto-arrange) — carries its own rollback callback.
  const showUndoAction = (message, icon, undo) => {
    clearTimeout(snackTimer.current);
    setSnack({ message, icon, undo, nonce: Date.now() });
    snackTimer.current = setTimeout(() => setSnack(null), 4500);
  };

  // ✨ Auto-arrange THIS day, then re-check it with the SAME rule engine the
  // ── ✨ Plan my day — one tap, deterministic, day-scoped ──────────────────────
  // planDay PLACES (hours + travel + pace) and reports the residual honestly. The
  // key anti-loop move: the result is gated on `changed`, so re-tapping a day that's
  // already arranged shows a calm "already arranged" — never the same prompt again.
  const planMyDay = () => {
    const day = trip.days[currentDay];
    if (!day) return;
    const schedulable = day.activities.filter(a => a.status !== 'skipped' && a.type !== 'note');
    if (schedulable.length < 1) {
      showUndoAction('Add a few places (Discover) and I’ll plan your day', 'sparkles', () => {});
      return;
    }
    const isLastDay = currentDay === trip.days.length - 1;
    const dayRole = isLastDay ? 'departure' : 'normal';
    // Anchor to where you wake: Day 1 → trip.origin; later days → last night's hotel.
    const anchor = dayStartAnchor(trip, currentDay) || undefined;
    // On the last day, FINISH the route at where you depart from — the return journey's
    // departure point (the airport you fly home from). So stops flow wake → … → airport
    // instead of stranding you across town. Only when that departure is actually known.
    let endAnchor;
    if (isLastDay) {
      const ret = day.activities.find(a => a.type === 'transport' && a.status !== 'skipped' && a.fromLat != null && a.fromLng != null);
      if (ret) endAnchor = { lat: ret.fromLat, lng: ret.fromLng };
    }
    // Checkout morning? If last night was the final night of a stay, hand planDay the
    // hotel + check-out time so it drops in a locked 15-min Check-out anchor (unless one
    // already exists) and keeps the getaway day light. Same covering-stay logic as the banner.
    const coLod = currentDay > 0 ? lodgingForNight(trip, currentDay - 1) : null;
    const coHotel = (coLod?.stay && coLod.isLastNight) ? coLod.stay : null;
    const checkout = coHotel
      ? { name: coHotel.name, time: checkOutOf(coHotel), lat: coHotel.lat ?? null, lng: coHotel.lng ?? null }
      : undefined;
    // Live trip: pin everything already past (TZ-aware) so Plan-my-day keeps it where it was and
    // only arranges the REMAINING time (earliestMin floors free placement after "now"). The
    // derived locks are stripped before writing so we never persist clock-state onto the trip.
    const userLocked = new Set(day.activities.filter(a => a.timeLocked).map(a => a.id));
    const input = day.activities.map(a => (pastIds.has(a.id) && !a.timeLocked) ? { ...a, timeLocked: true } : a);
    const stripDerived = (a) => {
      if (pastIds.has(a.id) && !userLocked.has(a.id) && a.timeLocked) {
        const { timeLocked, ...rest } = a; return rest;
      }
      return a;
    };
    const r = planDay(input, {
      dayRole, date: day.date, anchor, endAnchor, pace: trip.pace, families: trip.families, origin: trip.origin, checkout,
      earliestMin: planFloorMin(trip, currentDay, nowMs),
    });

    // Stable end-state: nothing moved → calm acknowledgement, never a re-prompt.
    if (!r.changed || r.changes.length === 0) {
      const calm = (r.overflow.length || r.unresolved.length)
        ? 'Already arranged · see Trip Check to fine-tune'
        : 'Day already looks good ✓';
      showUndoAction(calm, 'sparkles', () => {});
      return;
    }

    // PREVIEW-DIFF: show exactly what will move (times are ~approximate — they ride on
    // a free straight-line travel estimate), and let the user Apply or Discard. Nothing
    // is written until they tap Apply.
    // Venues the planner couldn't fit in their open hours today — shown LOUDLY in their
    // own block + left UNSCHEDULED (in the day's "doesn't fit" tray) after Apply, never
    // crammed past close. They're not "time changes", so keep them out of the shift list.
    const noFit = r.unresolved.filter(u => u.reason === 'no_fit_hours');
    const noFitIds = new Set(noFit.map(u => u.actId));

    // Leftovers the user should decide on (after arranging): a stop that can't fit its
    // hours, is too far for a checkout day, won't fit the day, is closed today, or is
    // beyond the pace cap. Each becomes one Move / Keep / Remove card so the day can reach
    // a clean state. 'tight' (a locked-time conflict) is NOT here — only unlocking fixes it.
    const MOVABLE = new Set(['no_fit_hours', 'checkout_heavy', 'day_full', 'closed']);
    const seenLeft = new Set();
    const decisionItems = [
      ...r.unresolved.filter(u => MOVABLE.has(u.reason)),
      ...r.overflow,                              // reason: 'capacity'
    ].filter(u => u.actId && !seenLeft.has(u.actId) && (seenLeft.add(u.actId), true));

    const whyLeftover = (reason) => ({
      closed:         'is closed today',
      no_fit_hours:   "won't fit its opening hours today",
      checkout_heavy: 'is a long way to go on a checkout day',
      day_full:       "won't fit in this day",
      capacity:       `is beyond your ${trip.pace} pace for the day`,
    }[reason] || 'needs another spot');

    // Walk the leftovers one card at a time → Move to the best open day · Keep · Remove.
    // Ends with a single undo that restores the whole pre-plan state (reorder + any moves).
    const decideLeftovers = (items, i, undo) => {
      if (i >= items.length) { showUndoAction('Day planned ✓', 'sparkles', undo); return; }
      const item = items[i];
      const venue = r.scheduled.find(a => a.id === item.actId);
      const title = (item.name || venue?.name || 'This stop').slice(0, 40);
      const next  = () => decideLeftovers(items, i + 1, undo);
      const best  = venue ? suggestDayForVenue(trip, venue, { excludeDayIndex: currentDay }).best : null;
      const bestLabel = best != null ? (trip.days[best]?.label || `Day ${best + 1}`) : null;
      const buttons = [];
      if (best != null) buttons.push({ text: `Move to ${bestLabel}`, onPress: () => { moveActivity(trip.id, currentDay, best, item.actId); next(); } });
      buttons.push({ text: 'Keep', style: 'cancel', onPress: next });
      buttons.push({ text: 'Remove', style: 'destructive', onPress: () => { deleteActivity(trip.id, item.actId); next(); } });
      Alert.alert(
        title,
        `${title} ${whyLeftover(item.reason)}.${bestLabel ? ` ${bestLabel} has room.` : ' No other day has obvious room — keep it here or remove it.'}`,
        buttons,
      );
    };

    const apply = () => {
      markPlanDayNoteSeen();
      const snap = planSnapshot();               // one undo for the whole operation (reorder + moves)
      setDayActivities(trip.id, currentDay, r.scheduled.map(stripDerived));
      const undo = () => restoreTripState(trip.id, snap);
      if (decisionItems.length) { decideLeftovers(decisionItems, 0, undo); return; }
      const tight = r.unresolved.filter(u => u.reason === 'tight').length;
      const bits = tight ? [`${tight} locked time${tight > 1 ? 's' : ''} still tight`] : [];
      showUndoAction(bits.length ? `Day planned · ${bits.join(' · ')}` : 'Day planned ✓', 'sparkles', undo);
    };

    const changeRows = r.changes.filter(c => !noFitIds.has(c.actId));
    const fmtRow = (c) => `•  ${c.name.length > 26 ? c.name.slice(0, 25) + '…' : c.name}:  ${c.from || '—'} → ~${c.to}`;
    const shown = changeRows.slice(0, 6).map(fmtRow).join('\n');
    const more  = changeRows.length > 6 ? `\n…and ${changeRows.length - 6} more` : '';

    // Leftovers become Move / Keep / Remove cards AFTER applying — just preview the count.
    const dCount = decisionItems.length;
    const decideNote = dCount
      ? `\n\n🗓️  ${dCount} stop${dCount > 1 ? 's' : ''} need${dCount > 1 ? '' : 's'} a quick call — I'll ask Move / Keep / Remove for each after you apply.`
      : '';
    const tightN = r.unresolved.filter(u => u.reason === 'tight').length;
    const tightNote = tightN
      ? `\n\n⚠️  ${tightN} locked time${tightN > 1 ? 's' : ''} can't move (still tight) — unlock to let me shift it.`
      : '';

    const n = changeRows.length;
    const lead = n
      ? `I'll arrange the day and shift ${n} ${n === 1 ? 'time' : 'times'} so travel and opening hours fit. Times are estimates (~):\n\n${shown}${more}`
      : `I’ve arranged the day around what fits.`;

    Alert.alert(
      '✨ Plan my day',
      `${lead}${decideNote}${tightNote}`,
      [
        { text: 'Discard', style: 'cancel' },
        { text: dCount ? 'Apply & decide' : 'Apply', onPress: apply },
      ],
    );
  };

  // ── Open this day's route in Google Maps ──────────────────────────
  // Feeds the day's points (wake → stops → tonight's hotel) to Google Maps as a
  // multi-stop route. Free, no key — opens the native app. Null when <2 points.
  const dayRouteUrl = day ? googleMapsDayUrl(trip, currentDay) : null;
  const openDayRoute = () => {
    if (!dayRouteUrl) return;
    Linking.openURL(dayRouteUrl).catch(() =>
      showUndoAction("Couldn't open Google Maps", 'warning-outline', () => {}),
    );
  };

  // ── Eat at the hotel (in-room dining) ─────────────────────────────
  // (Removed) The auto-suggested "<meal> at <your hotel>" chip. It assumed the lodging served
  // that meal at that slot, but lodges/resorts have their own — often limited or guests-only —
  // dining hours, so the suggestion was unreliable. Add meals explicitly via "+ Add here" or
  // Discover instead.

  // Toggle an activity's done state (the card checkbox) + undo toast. 'Did not do' was retired
  // from the Phase-1 planner UI; the engine still understands 'skipped' for any existing data.
  const setDone = (act) => {
    const prev = act.status ?? null;
    const next = prev === 'done' ? null : 'done';
    markActivityStatus(trip.id, act.id, next);
    showUndo(next === 'done' ? 'Marked as done' : 'Marked as not done',
             next === 'done' ? 'checkmark-circle' : 'ellipse-outline', act.id, prev);
  };

  // Pin/unpin an exact time — a locked stop is a fixed anchor "Plan my day" won't move.
  const toggleLock = (act) => {
    toggleActivityLock(trip.id, act.id);
    showUndoAction(
      act.timeLocked
        ? `${act.time} unlocked · Plan my day can move it`
        : `🔒 ${act.time} locked · Plan my day keeps this time and arranges the rest around it`,
      act.timeLocked ? 'lock-open-outline' : 'lock-closed',
      () => toggleActivityLock(trip.id, act.id),
    );
  };

  // A locked stop is a fixed anchor — block MANUAL moves too (another day, another
  // slot), not just Plan my day. Warn and require an explicit unlock first.
  const guardMove = (act, move) => {
    // A stop whose time has already passed (TZ-aware) is auto-locked — moving it rewrites
    // history, so confirm first (no "unlock", it's the clock). User-locked → the unlock flow.
    if (!act.timeLocked && pastIds.has(act.id)) {
      Alert.alert(
        `🕒 ${(act.name || 'This stop').slice(0, 40)} already happened`,
        `Its ${act.time} start time has passed, so it's locked to keep your trip accurate. Move it anyway?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Move anyway', onPress: move }],
      );
      return;
    }
    if (!act.timeLocked) { move(); return; }
    Alert.alert(
      `🔒 ${(act.name || 'This stop').slice(0, 40)} is locked`,
      `Its ${act.time} start time is locked, so it stays put. Unlock it first to move it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => toggleActivityLock(trip.id, act.id) },
      ],
    );
  };

  // Up/Down SWAP an adjacent pair's times — so it must refuse if EITHER the moved stop
  // OR the neighbor it swaps with is locked. Otherwise moving a non-locked stop past a
  // locked one silently rewrites the locked stop's time (the reported bug). Names the
  // locked stop and offers to unlock it.
  const guardSwap = (moved, neighbor, doMove) => {
    const locked = moved?.timeLocked ? moved : (neighbor?.timeLocked ? neighbor : null);
    if (!locked) {
      // Neither is user-locked — but reordering across a PAST stop rewrites a time that's
      // already happened. Confirm rather than silently swap it.
      const past = pastIds.has(moved?.id) ? moved : (pastIds.has(neighbor?.id) ? neighbor : null);
      if (past) {
        Alert.alert(
          `🕒 ${(past.name || 'A stop').slice(0, 40)} already happened`,
          `Reordering here would change a time that's already passed. Move anyway?`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Move anyway', onPress: doMove }],
        );
        return;
      }
      doMove();
      return;
    }
    const movingTheLock = locked === moved;
    Alert.alert(
      `🔒 ${(locked.name || 'A stop').slice(0, 40)} is locked`,
      movingTheLock
        ? `Its ${locked.time} start time is locked. Unlock it first to move it.`
        : `This move would change ${locked.name || 'a locked stop'}’s locked ${locked.time} time. Unlock it first to reorder around it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => toggleActivityLock(trip.id, locked.id) },
      ],
    );
  };

  // Long-press → move activity to a different time slot (same day)
  const openSlotMove = (act) => {
    const currentSlot = getSlotKey(act.time);
    const options = DAY_SLOTS
      .filter(sl => sl.key !== currentSlot)
      .map(sl => ({
        text: `${sl.emoji} ${sl.label} (${sl.defaultTime})`,
        onPress: () => updateActivity(trip.id, act.id, { time: sl.defaultTime }),
      }));
    Alert.alert(
      `Move "${act.name}"`,
      `Currently in ${DAY_SLOTS.find(s => s.key === currentSlot)?.label || 'slot'}. Move to:`,
      [...options, { text: 'Cancel', style: 'cancel' }],
    );
  };

  // Swipe delete → remove now, offer undo (consistent with Done / Didn't-do, no
  // interrupting dialog). The snapshot restores the activity with its original id;
  // addActivity re-links its Splitwise expense. (A costed item's expense comes
  // back at the default per-family split, not any custom tweaks.)
  const deleteWithUndo = (act) => {
    const snapshot = { ...act };
    deleteActivity(trip.id, act.id);
    showUndoAction('Activity deleted', 'trash-outline', () => addActivity(trip.id, currentDay, snapshot));
  };

  // ── Reset the plan ────────────────────────────────────────────────
  // Wipe a day (or the whole trip) back to empty so you can re-plan from
  // scratch — also handy for exercising features. Snapshots the trip's plan +
  // expenses first so the whole reset is one Undo away.
  const planSnapshot = () => ({
    days: trip.days, expenses: trip.expenses,
    itineraryPushed: trip.itineraryPushed, budgetByFamily: trip.budgetByFamily,
  });
  const countActs = (day) => (day?.activities || []).filter(a => a.status !== 'skipped').length;

  const resetDay = () => {
    const day = trip.days[currentDay];
    const n = countActs(day);
    if (!n) { Alert.alert('Nothing to clear', `${day?.label || 'This day'} has no activities.`); return; }
    const snap = planSnapshot();
    Alert.alert(
      `Clear ${day.label}?`,
      `Removes all ${n} ${n === 1 ? 'activity' : 'activities'} on ${day.label} and their auto-added expenses. You can undo.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear day', style: 'destructive', onPress: () => {
          resetDayActivities(trip.id, currentDay);
          showUndoAction(`Cleared ${day.label}`, 'trash-outline', () => restoreTripState(trip.id, snap));
        } },
      ],
    );
  };

  const resetAll = () => {
    const total = trip.days.reduce((sum, d) => sum + countActs(d), 0);
    if (!total) { Alert.alert('Nothing to clear', 'This trip has no activities yet.'); return; }
    const snap = planSnapshot();
    Alert.alert(
      'Clear all days?',
      `Removes all ${total} activities across ${trip.days.length} days and resets the plan to empty. Manual expenses are kept. You can undo.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all days', style: 'destructive', onPress: () => {
          resetAllActivities(trip.id);
          setCurrentDay(0);
          showUndoAction('Cleared all days', 'trash-outline', () => restoreTripState(trip.id, snap));
        } },
      ],
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Sticky header — always visible, never scrolls away */}
      <StickyHeader
        trip={trip}
        currentDay={currentDay}
        onSelectDay={setCurrentDay}
        onPush={handlePush}
        onCheckTrip={onCheckTrip}
        onResetDay={resetDay}
        onResetAll={resetAll}
        onPlayTrip={() => setShowPlayTrip(true)}
      />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
        stickyHeaderIndices={[0]}
      >

        {/* Day Navigation — PINNED (sticky) so you can hop between days without scrolling back
            to the top, even on long photo-forward days. Solid bar so content doesn't bleed
            through when stuck. (no live "today" tracking in the planner) */}
        <View style={styles.dayNavBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xxl }}>
            {trip.days.map((d, i) => {
              const dc = calcDayCostForTrip(d, trip);
              const healthDot = HEALTH_DOT[healthByDay[i]];   // undefined for clean/empty/tip → calm
              return (
                <TouchableOpacity
                  key={d.date}
                  style={[styles.dayBtn, i === currentDay && styles.dayBtnActive]}
                  onPress={() => setCurrentDay(i)}
                >
                  {healthDot && <View style={[styles.dayHealthDot, { backgroundColor: healthDot }]} />}
                  <Text style={[styles.dayBtnLabel, i === currentDay && styles.dayBtnLabelActive]}>{d.label}</Text>
                  <Text style={[styles.dayBtnWeekday, i === currentDay && { color: colors.primary }]}>{WD_SHORT[weekdayOf(d.date)] || ''}</Text>
                  <Text style={[styles.dayBtnDate, i === currentDay && { color: colors.primary }]}>{fmt(d.date)}</Text>
                  {dc > 0 && <Text style={styles.dayCost}>{fmtM(dc)}</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Must-dos strip ── */}
        {(() => {
          const raw = trip.mustDos?.trim();
          if (!raw || mustDosDismissed) return null;
          const items = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
          const allDone = items.every((_, i) => mustDosChecked[i]);
          return (
            <View style={styles.mustDosStrip}>
              <View style={styles.mustDosHeader}>
                <View style={styles.mustDosTitleRow}>
                  <Icon name="bookmark" size={13} color="#92400e" />
                  <Text style={styles.mustDosTitle}>Must-dos</Text>
                </View>
                <TouchableOpacity onPress={() => setMustDosDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.mustDosHideBtn}>
                  <Icon name="close" size={12} color="#92400e" />
                  <Text style={styles.mustDosDismiss}>Hide</Text>
                </TouchableOpacity>
              </View>
              {allDone ? (
                <Text style={styles.mustDosAllDone}>✓ All must-dos added!</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mustDosRow}>
                  {items.map((item, i) => {
                    const checked = !!mustDosChecked[i];
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[styles.mustDosChip, checked && styles.mustDosChipDone]}
                        onPress={() => setMustDosChecked(prev => ({ ...prev, [i]: !prev[i] }))}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.mustDosChipText, checked && styles.mustDosChipTextDone]}>
                          {checked ? '✓ ' : ''}{item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>
          );
        })()}

        {/* ── "Heading home?" — last-day return-journey one-tap draft (propose, never
            commit; only known facts pre-filled, cost left blank, dismissal remembered) ── */}
        {(() => {
          const isLastDay = currentDay === trip.days.length - 1;   // also true on a 1-day day-trip
          if (!isLastDay) return null;
          if ((trip.ignoredWarnings || []).includes('return_journey')) return null;
          const draft = returnJourneyDraft(trip);
          if (!draft) return null;
          const emoji = { flight: '✈️', car: '🚗', train: '🚆', ship: '⛴️', bus: '🚌' }[draft.subtype] || '🧳';
          const isFlight = draft.subtype === 'flight';
          const addReturn = () => {
            const id = uid();
            const { driveMin: _dm, ...act } = draft;   // driveMin is card-only metadata, not an activity field
            addActivity(trip.id, currentDay, { ...act, id });
            showUndoAction(`${emoji} ${draft.name} added · ${isFlight ? 'set the time' : 'set the time + cost'}`, 'airplane-outline', () => deleteActivity(trip.id, id));
          };
          return (
            <View style={styles.returnCard}>
              <Text style={styles.returnTitle}>{emoji}  Heading home?</Text>
              <Text style={styles.returnBody}>
                {isFlight
                  ? `Your return flight is usually booked round-trip (already paid) — add “${draft.name}” so the last day plans around it. We left the cost off; just set the time.`
                  : `Add your way home — we pre-filled “${draft.name}”. Set the time, and the cost if there is one.`}
              </Text>
              {!isFlight && draft.driveMin ? (
                <Text style={styles.returnEta}>
                  🚗 ≈ {formatDuration(draft.driveMin)} drive · leave {draft.time} → home by ~{draft.arriveTime}
                </Text>
              ) : null}
              <View style={styles.returnBtnRow}>
                <TouchableOpacity style={styles.returnAddBtn} onPress={addReturn} activeOpacity={0.85}>
                  <Text style={styles.returnAddText}>+ Add return</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.returnDismissBtn} onPress={() => ignoreWarning(trip.id, 'return_journey')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
                  <Text style={styles.returnDismissText}>Not now</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {/* Day Header — the day + date live in the selector chips and sticky header
            right above, so this row is just the day's actions (kept right-aligned so
            they don't compete with the left-anchored day-status pill below). */}
        {day && (
          <View style={styles.dayHeader}>
            {/* Each activity carries its own zone label in its eyebrow (see ActivityCard) — shown
                consistently on every stop, so a single-zone trip is never blank next to a
                zone-crossing one. No day-level chip. */}
            <View style={styles.dayHeaderActions}>
              {!!dayRouteUrl && (
                <TouchableOpacity style={styles.routeBtn} onPress={openDayRoute} activeOpacity={0.85}>
                  <Icon name="map" size={13} color={colors.accent} />
                  <Text style={styles.routeBtnText}>Route</Text>
                </TouchableOpacity>
              )}
              {/* Plan-my-day is locked for a day that's already in the past (past day of a live
                  trip, or any day of a finished trip) — you can't plan time that's gone. */}
              <TouchableOpacity
                style={[styles.arrangeBtn, dayPast && styles.btnDisabled]}
                onPress={() => dayPast
                  ? showUndoAction('This day has passed — Plan my day works on upcoming days', 'sparkles', () => {})
                  : planMyDay()}
                activeOpacity={0.85}
              >
                <Icon name={dayPast ? 'lock-closed' : 'sparkles'} size={13} color={dayPast ? colors.subtle : colors.smart} />
                <Text style={[styles.arrangeBtnText, dayPast && { color: colors.subtle }]}>Plan my day</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addActBtn} onPress={openAdd}>
                <Icon name="create-outline" size={13} color="#fff" />
                <Text style={styles.addActBtnText}>Manual</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Inline Trip Check for THIS day — ONE calm summary pill (positive-first),
            not a wall of red chips. Tap to open the full checker. */}
        {day && day.activities.length > 0 && (() => {
          const nErr  = dayWarnings.filter(w => w.severity === 'error').length;
          const nWarn = dayWarnings.filter(w => w.severity === 'warning').length;
          const nTip  = dayWarnings.filter(w => w.severity === 'info').length;
          if (!nErr && !nWarn && !nTip) return null;   // clean day → calm; no green "well-paced" pill
          const tipWord = n => `${n} tip${n !== 1 ? 's' : ''}`;
          let tone, label;
          if (nErr > 0) {
            const rest = nWarn + nTip;
            tone = 'fix';  label = `${nErr} to fix${rest ? ` · ${tipWord(rest)}` : ''}`;
          } else if (nWarn > 0) {
            tone = 'check'; label = `${nWarn} to check${nTip ? ` · ${tipWord(nTip)}` : ''}`;
          } else {
            tone = 'tip';  label = `${tipWord(nTip)} for this day`;
          }
          const pal = DAY_PILL[tone];
          return (
            <TouchableOpacity
              style={[styles.dayPill, { backgroundColor: pal.bg }]}
              onPress={onCheckTrip}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`This day: ${label}. Tap to review.`}
            >
              <Icon name={pal.icon} size={14} color={pal.fg} />
              <Text style={[styles.dayPillText, { color: pal.fg }]} numberOfLines={1}>{label}</Text>
              <Icon name="forward" size={13} color={pal.fg} />
            </TouchableOpacity>
          );
        })()}

        {/* Day-1 starting point — the bookend to the "Sleeping at…" footer. Tap to
            set/edit; when set, the first stop below shows its travel leg from here. */}
        {day && currentDay === 0 && (
          trip.origin?.label ? (
            <TouchableOpacity style={styles.originChip} onPress={() => setShowOrigin(true)} activeOpacity={0.7}>
              <Icon name="location" size={14} color={colors.smart} />
              <Text style={styles.originChipText} numberOfLines={1}>Starting from {trip.origin.label}</Text>
              <Icon name="create-outline" size={12} color={colors.subtle} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.originAddChip} onPress={() => setShowOrigin(true)} activeOpacity={0.7}>
              <Icon name="add" size={14} color={colors.subtle} />
              <Text style={styles.originAddText}>Add starting point</Text>
            </TouchableOpacity>
          )
        )}


        {/* "Doesn't fit this day" tray — venues the planner left UNSCHEDULED because this
            day is too packed to fit them during their open hours. Loud + actionable: move
            to another day (never crammed into a slot after the venue has closed). */}
        {day && (() => {
          const unfit = day.activities.filter(a => !a.time && a.status !== 'skipped' && a.type !== 'note');
          if (!unfit.length) return null;
          return (
            <View style={styles.noFitTray}>
              <Text style={styles.noFitTitle}>
                🗓️  {unfit.length === 1 ? "1 stop doesn’t fit this day" : `${unfit.length} stops don’t fit this day`}
              </Text>
              <Text style={styles.noFitSub}>
                Too packed to fit {unfit.length === 1 ? 'it' : 'them'} during open hours — for each, move it to a day with room, keep it here anyway, or remove it.
              </Text>
              {unfit.map(a => {
                // Confident one-tap target: a day whose open hours genuinely have room.
                const best = suggestDayForVenue(trip, a, { excludeDayIndex: currentDay }).best;
                return (
                  <View key={a.id} style={styles.noFitRow}>
                    <Text style={styles.noFitName} numberOfLines={1}>{a.name}</Text>
                    {!!a.openHours && (
                      <Text style={styles.noFitHours}>Open {hoursLabel(a.openHours, weekdayOf(day.date))}</Text>
                    )}
                    <View style={styles.noFitActions}>
                      {best != null ? (
                        <TouchableOpacity style={styles.noFitMoveBtn} onPress={() => moveUnfitTo(a, best)} activeOpacity={0.85}>
                          <Icon name="calendar" size={13} color="#fff" />
                          <Text style={styles.noFitMoveText}>Move to {trip.days[best]?.label || `Day ${best + 1}`}</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.noFitMoveBtn} onPress={() => setMovingAct(a)} activeOpacity={0.85}>
                          <Icon name="calendar" size={13} color="#fff" />
                          <Text style={styles.noFitMoveText}>Move to a day…</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.noFitGhostBtn} onPress={() => keepOnDay(a)} activeOpacity={0.7}>
                        <Text style={styles.noFitGhostText}>Keep</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.noFitGhostBtn} onPress={() => deleteWithUndo(a)} activeOpacity={0.7}>
                        <Text style={styles.noFitGhostText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Day template — Morning / Afternoon / Evening / Night */}
        <View style={styles.activities}>
          {!day ? null : day.activities.length === 0 ? (
            // Completely empty day — show AI/manual prompts then slot template
            <View>
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🗺️</Text>
                <Text style={styles.emptyText}>Let&apos;s fill {day?.label || 'this day'}</Text>
                <Text style={styles.emptyHint}>Pick a time of day below, or tap Discover to find places nearby.</Text>
                {!!onPlanWithAI && (
                  <TouchableOpacity style={styles.emptyAiBtn} onPress={onPlanWithAI} activeOpacity={0.85}>
                    <Icon name="sparkles" size={16} color="#fff" />
                    <Text style={styles.emptyAiBtnText}>Plan with AI</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Empty slot template */}
              {DAY_SLOTS.map(slot => (
                <React.Fragment key={slot.key}>
                  <TouchableOpacity
                    style={styles.emptySlot}
                    onPress={() => openAddInSlot(slot.defaultTime)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.emptySlotIcon, { backgroundColor: slot.tint + '1A' }]}>
                      <Icon name={slot.icon} size={18} color={slot.tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.emptySlotLabel}>{slot.label}</Text>
                      <Text style={styles.emptySlotHint}>{slot.hint} · tap to add</Text>
                    </View>
                    <Icon name="add" size={20} color={colors.subtle} />
                  </TouchableOpacity>
                </React.Fragment>
              ))}
            </View>
          ) : (
            // Has activities — ONE chronological timeline. Soft time-of-day dividers
            // (Morning/Afternoon/Evening/Night) appear only where the part of day changes,
            // replacing the old four fixed sections — so a sparse day shows its photos, not
            // empty section chrome. Only TIMED stops sit here; unscheduled (time=null) stops
            // live in the "Doesn't fit" tray above.
            (() => {
              const timed = [...day.activities]
                .filter(a => a.time)
                .sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
              const orderedIds = timed.map(a => a.id);

              // Day has only unscheduled stops (all in the tray above) → a calm add row.
              if (timed.length === 0) {
                return (
                  <TouchableOpacity style={styles.slotCompact} onPress={() => openAddInSlot('09:00')} activeOpacity={0.6}>
                    <Icon name="add" size={14} color={colors.accent} />
                    <Text style={styles.slotCompactText}>Add a stop</Text>
                  </TouchableOpacity>
                );
              }

              let lastSlotKey = null;
              return (
                <View>
                  {timed.map((act, index) => {
                    const prev     = index > 0 ? timed[index - 1] : null;
                    const slotKey  = getSlotKey(act.time);
                    const newPart  = slotKey !== lastSlotKey;
                    lastSlotKey    = slotKey;
                    const slotMeta = DAY_SLOTS.find(s => s.key === slotKey);
                    return (
                      <React.Fragment key={act.id}>
                        {/* Soft divider — only when the part of day changes */}
                        {newPart && (
                          <View style={styles.tlDivider}>
                            <Icon name={slotMeta?.icon} size={13} color={slotMeta?.tint || colors.subtle} />
                            <Text style={[styles.tlDividerLabel, { color: slotMeta?.tint || colors.subtle }]}>
                              {slotMeta?.label}
                            </Text>
                            <View style={styles.tlDividerLine} />
                            <TouchableOpacity
                              onPress={() => openAddInSlot(slotMeta?.defaultTime || act.time)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={styles.tlDividerAdd}>+ add</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* First stop: travel leg from where you WOKE — origin on Day 1,
                            last night's hotel / friends-camping address otherwise. */}
                        {index === 0 && startAnchor?.lat != null && (
                          <OriginConnector origin={startAnchor} to={act} />
                        )}
                        {/* Woke somewhere we can't map (friends/camping, no address) → an
                            honest, self-explaining invite instead of a dropped first leg. */}
                        {index === 0 && startAnchor?.lat == null && priorNightNeedsAddr && (
                          <TouchableOpacity style={styles.wakeAskRow} onPress={() => openNightPlan(currentDay - 1)} activeOpacity={0.7}
                            accessibilityRole="button" accessibilityLabel="Morning starts at your first stop. Add where you stayed last night to map the drive.">
                            <Text style={styles.wakeAskText}>🌅 Morning starts at your first stop · <Text style={styles.wakeAskLink}>add where you stayed ›</Text></Text>
                          </TouchableOpacity>
                        )}
                        {/* Travel leg between consecutive stops (now uniform across the whole day) */}
                        {index > 0 && <TravelConnector from={prev} to={act} />}

                        {/* The stop */}
                        <View collapsable={false} ref={(n) => { rowRefs.current[act.id] = n; }}>
                          <ActivityCard
                            activity={act}
                            trip={trip}
                            dayDate={day.date}
                            zoneLabel={dayZones.zoneById[act.id]}
                            leg={act.type === 'transport' ? crossZoneLeg(trip, dayIdx, act) : null}
                            autoLocked={pastIds.has(act.id)}
                            originStop={prev}
                            isHighlighted={highlightedActIds.includes(act.id)}
                            isFirst={index === 0}
                            isLast={index === timed.length - 1}
                            onMoveUp={() => {
                              if (index === 0) return;
                              guardSwap(act, timed[index - 1], () => {
                                const newOrder = [...orderedIds];
                                [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                                reorderSlotActivities(trip.id, currentDay, newOrder);
                              });
                            }}
                            onMoveDown={() => {
                              if (index === timed.length - 1) return;
                              guardSwap(act, timed[index + 1], () => {
                                const newOrder = [...orderedIds];
                                [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                                reorderSlotActivities(trip.id, currentDay, newOrder);
                              });
                            }}
                            onMarkDone={() => setDone(act)}
                            onEdit={() => openEdit(act)}
                            onDelete={() => deleteWithUndo(act)}
                            onMoveRequest={() => guardMove(act, () => setMovingAct(act))}
                            onSlotMove={() => guardMove(act, () => openSlotMove(act))}
                            onToggleLock={() => toggleLock(act)}
                            onExploreNearby={() => exploreNearby(act)}
                          />
                        </View>
                      </React.Fragment>
                    );
                  })}
                </View>
              );
            })()
          )}

          {/* Checkout day — you leave last night's hotel this morning. Offer a calm, polite
              prompt to drop a 15-min checkout stop AT the hotel, so the day's route starts
              from the right place (routing anchor). Hidden once a checkout exists. */}
          {day && (() => {
            const co = currentDay > 0 ? lodgingForNight(trip, currentDay - 1) : null;
            const hotel = (co?.stay && co.isLastNight) ? co.stay : null;
            if (!hotel) return null;
            if ((day.activities || []).some(a => a.checkout && a.status !== 'skipped')) return null;
            const time = checkOutOf(hotel);
            const askAddCheckout = () => Alert.alert(
              `Leaving ${hotel.name}`,
              `Add a 15-minute checkout so this day's route starts from the hotel? Standard checkout is ${time} — you can change the time on the card.`,
              [
                { text: 'Not now', style: 'cancel' },
                { text: `Add checkout (${time})`, onPress: () => {
                  const id = uid();
                  addActivity(trip.id, currentDay, {
                    id, type: 'activity', subtype: 'misc', checkout: true,
                    time, durationMins: 15,
                    name: `Check out of ${hotel.name}`, detail: 'Pack up and head out',
                    costPerPerson: 0, costMode: 'per_person', costAmount: 0,
                    address: hotel.address || '', url: hotel.url || '',
                    lat: hotel.lat ?? null, lng: hotel.lng ?? null,
                    note: null, status: null,
                  });
                  showUndoAction('Checkout added', 'hotel', () => deleteActivity(trip.id, id));
                } },
              ],
            );
            return (
              <TouchableOpacity
                style={styles.checkoutBanner} onPress={askAddCheckout} activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Checkout day, leaving ${hotel.name}. Add a checkout stop.`}
              >
                <Text style={styles.checkoutBannerIcon}>🧳</Text>
                <Text style={styles.checkoutBannerText} numberOfLines={2}>Checkout day · leaving {hotel.name}</Text>
                <Text style={styles.checkoutBannerAdd}>Add checkout →</Text>
              </TouchableOpacity>
            );
          })()}

          {/* Where the group sleeps tonight — DERIVED from the one check-in stay,
              never an editable row (so the booking cost can't be duplicated). */}
          {day && (() => {
            const lod = lodgingForNight(trip, currentDay);
            if (lod?.overnightTransit) {
              return (
                <View style={styles.lodgeChip}>
                  <Icon name="transport" size={14} color={colors.smart} />
                  <Text style={styles.lodgeChipText}>Overnight — {lod.overnightTransit.name}</Text>
                </View>
              );
            }
            if (lod?.stay) {
              // Tonight's lodging is DERIVED from the one check-in stay. When it's a
              // searchable hotel, make the chip a tap-to-Book link (Booking.com = the
              // revenue stream) so every covered night carries the affordance — without
              // duplicating the check-in day's photo-forward stay card.
              const book = bookingUrl(lod.stay);
              const inner = (
                <>
                  <Icon name="hotel" size={14} color={colors.smart} />
                  <Text style={styles.lodgeChipText}>Night {lod.nightNumber} of {lod.nights} · {lod.stay.name}</Text>
                  {!lod.isCheckInDay && <Text style={styles.lodgeChipMuted}>· no extra charge</Text>}
                  {!!book && <Text style={styles.lodgeBookLink}>  🛏 Book ›</Text>}
                </>
              );
              return book ? (
                <TouchableOpacity style={styles.lodgeChip} activeOpacity={0.8}
                  onPress={() => Linking.openURL(book).catch(() => {})}
                  accessibilityRole="link" accessibilityLabel={`Book ${lod.stay.name} on Booking.com`}>
                  {inner}
                </TouchableOpacity>
              ) : (
                <View style={styles.lodgeChip}>{inner}</View>
              );
            }
            // The user told us this hotel-less night is covered → calm settled chip
            // (tap to change or clear). This is the answer to the "where are you
            // staying?" question below — never an amber nag.
            if (lod?.nightPlan?.type && NIGHT_PLAN_META[lod.nightPlan.type]) {
              const np = lod.nightPlan;
              const m = NIGHT_PLAN_META[np.type];
              const located = NIGHT_PLAN_OPTIONS.find(o => o.key === np.type)?.located;
              return (
                <TouchableOpacity style={styles.lodgeChip} onPress={() => openNightPlan(currentDay)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel={`Tonight: ${m.a11y}${np.label ? `, ${np.label}` : ''}. Settled. Opens choices to change tonight's plan${located && !np.label ? ' or add an address' : ''}.`}>
                  <Icon name={m.icon} size={14} color={colors.smart} />
                  <Text style={styles.lodgeChipText}>{m.label}{np.label ? ` · ${np.label}` : ''}</Text>
                  {located && !np.label
                    ? <Text style={styles.lodgeChipMuted}>· add address ›</Text>
                    : <Icon name="chevron-forward" size={12} color={colors.subtle} />}
                </TouchableOpacity>
              );
            }
            const isLast = currentDay === (trip.days?.length || 0) - 1;
            const hasAnyStay = (trip.days || []).some(d =>
              d.activities.some(a => a.type === 'stay' && a.status !== 'skipped'));
            if (isLast && hasAnyStay) {
              return (
                <View style={styles.lodgeChip}>
                  <Icon name="location" size={14} color={colors.subtle} />
                  <Text style={styles.lodgeChipText}>No hotel tonight — heading home</Text>
                </View>
              );
            }
            // Uncovered interior night → a calm QUESTION (not amber, not a warning):
            // tap to say how it's handled (overnight travel, with family, camping…).
            if (!isLast && (trip.days?.length || 0) >= 2) {
              return (
                <TouchableOpacity style={styles.lodgeChipAsk} onPress={() => openNightPlan(currentDay)} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel="Tonight's stay — not set yet. Opens choices for how tonight is handled.">
                  <Text style={styles.lodgeAskEmoji}>🌙</Text>
                  <Text style={styles.lodgeChipAskText}>Where are you staying tonight?</Text>
                  <Icon name="chevron-forward" size={13} color={colors.smart} />
                </TouchableOpacity>
              );
            }
            return null;
          })()}
        </View>
      </ScrollView>

      {/* ── Discover FAB — single primary action, bottom-right ── */}
      <TouchableOpacity
        style={styles.discoverFab}
        onPress={() => { setDiscoverNear(null); setDiscoverStayOnly(false); setDiscoverSlot(null); setShowDiscover(true); }}
        activeOpacity={0.85}
      >
        <Icon name="search" size={16} color="#fff" />
        <Text style={styles.discoverFabText}>Discover</Text>
      </TouchableOpacity>

      {/* Undo toast — appears above the FAB after any swipe action (done/didn't-do/delete) */}
      {snack && (
        <Snackbar
          key={snack.nonce}
          message={snack.message}
          icon={snack.icon}
          actionLabel="Undo"
          onAction={undoStatus}
          bottom={92}
        />
      )}

      {/* One-shot celebration when Trip Check just turned all-green */}
      {celebrate && <ConfettiBurst onDone={() => setCelebrate(false)} />}

      {/* "How's tonight handled?" — a polite, one-tap resolver for a hotel-less
          night. Picking a reason writes day.nightPlan; a located reason (friends/
          camping) also offers an OPTIONAL address that anchors tomorrow's first
          drive. Flips the chip to a calm settled state. Never re-prompts. */}
      {nightPlanDay !== null && (() => {
        const np = trip.days?.[nightPlanDay]?.nightPlan;
        const activeType = np?.type || null;
        const showAddr = !!NIGHT_PLAN_OPTIONS.find(o => o.key === activeType)?.located;
        return (
          <Modal visible transparent animationType="slide" onRequestClose={closeNightPlan}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <TouchableOpacity style={styles.npOverlay} activeOpacity={1} onPress={closeNightPlan}>
              <View style={styles.npSheet} onStartShouldSetResponder={() => true}>
                <View style={styles.npHandle} />
                <Text style={styles.npTitle}>How&apos;s tonight handled?</Text>
                <Text style={styles.npSubtitle}>Just so we know you&apos;ve got it sorted — we won&apos;t ask again.</Text>
                {NIGHT_PLAN_OPTIONS.map(opt => {
                  const active = activeType === opt.key;
                  return (
                    <TouchableOpacity key={opt.key} style={[styles.npRow, active && styles.npRowActive]}
                      onPress={() => pickNightPlan(opt.key)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityLabel={opt.label}>
                      <Text style={styles.npEmoji}>{opt.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.npLabel}>{opt.label}</Text>
                        {!!opt.sub && <Text style={styles.npSub}>{opt.sub}</Text>}
                      </View>
                      {active && <Icon name="checkmark" size={16} color={colors.smart} />}
                    </TouchableOpacity>
                  );
                })}

                {/* Optional address — only for a located reason; anchors the morning drive */}
                {showAddr && (
                  <View style={styles.npAddr}>
                    <LocationSearchField
                      label="Where you stayed — optional"
                      value={np?.label || ''}
                      placeholder="Friend's place, campground…"
                      onSelect={(label, coords) => setNightAddress(label, coords)}
                    />
                    <Text style={styles.npAddrHint}>Optional — helps us map tomorrow&apos;s first drive. Skip anytime.</Text>
                  </View>
                )}

                <TouchableOpacity style={styles.npRow} onPress={addHotelFromNightPlan} activeOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel="Add a hotel instead">
                  <Text style={styles.npEmoji}>🏨</Text>
                  <Text style={[styles.npLabel, { flex: 1 }]}>Add a hotel instead</Text>
                  <Icon name="chevron-forward" size={14} color={colors.subtle} />
                </TouchableOpacity>

                {showAddr && (
                  <TouchableOpacity style={styles.npDone} onPress={closeNightPlan} activeOpacity={0.85}
                    accessibilityRole="button" accessibilityLabel="Done">
                    <Text style={styles.npDoneText}>Done</Text>
                  </TouchableOpacity>
                )}

                {!!activeType && (
                  <TouchableOpacity style={styles.npClear} onPress={() => pickNightPlan(null)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel="Clear this — flag the night again">
                    <Text style={styles.npClearText}>↺ Actually, flag this night again</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      <SetOriginModal
        visible={showOrigin}
        trip={trip}
        onClose={() => setShowOrigin(false)}
      />

      <PlayTripModal
        visible={showPlayTrip}
        trip={trip}
        onClose={() => setShowPlayTrip(false)}
      />

      <AddActivityModal
        visible={showAddActivity}
        trip={trip}
        currentDay={currentDay}
        editActivity={editActivity}
        defaultTime={defaultSlotTime}
        seed={manualSeed}
        onClose={closeModal}
      />

      <DiscoverModal
        visible={showDiscover}
        onClose={() => { setShowDiscover(false); setDiscoverNear(null); setDiscoverCity(null); setDiscoverStayOnly(false); setDiscoverSlot(null); }}
        trip={trip}
        dayIndex={currentDay}
        defaultTime={defaultSlotTime}
        defaultSlot={discoverSlot}
        nearby={discoverNear}
        initialCity={discoverCity}
        focusStay={discoverStayOnly}
        onAddManual={(arg) => {
          // arg is a search string (the "add manually" bridge) OR a {lat,lng}
          // object (a pin dropped on the map → seed Stay with that location).
          setShowDiscover(false); setDiscoverNear(null); setDiscoverCity(null); setDiscoverStayOnly(false); setDiscoverSlot(null);
          const seed = (arg && typeof arg === 'object')
            ? { lat: arg.lat, lng: arg.lng, address: arg.address || '', tile: 'stay' }
            : { name: arg || '' };
          openManual(seed, defaultSlotTime);
        }}
      />

      {/* ── Day picker — move activity to another day ── */}
      <Modal
        visible={!!movingAct}
        transparent
        animationType="slide"
        onRequestClose={() => setMovingAct(null)}
      >
        <TouchableOpacity style={styles.dayPickerOverlay} activeOpacity={1} onPress={() => setMovingAct(null)}>
          <View style={styles.dayPickerSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.dayPickerHandle} />
            <Text style={styles.dayPickerTitle}>Move &quot;{movingAct?.name}&quot; to…</Text>
            <FlatList
              data={trip.days}
              keyExtractor={(_, i) => String(i)}
              style={{ maxHeight: 340 }}
              renderItem={({ item: d, index: i }) => {
                const isCurrent = i === currentDay;
                return (
                  <TouchableOpacity
                    style={[styles.dayPickerRow, isCurrent && styles.dayPickerRowCurrent]}
                    onPress={() => {
                      if (!isCurrent) {
                        // An unscheduled (didn't-fit) stop lands at an in-hours time on its
                        // new day; a normal timed stop just changes days (keeps its time).
                        if (!movingAct.time) moveUnfitTo(movingAct, i);
                        else moveActivity(trip.id, currentDay, i, movingAct.id);
                        setMovingAct(null);
                      }
                    }}
                    activeOpacity={isCurrent ? 1 : 0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.dayPickerLabel, isCurrent && styles.dayPickerLabelCurrent]}>
                        {d.label}
                      </Text>
                      <Text style={styles.dayPickerDate}>{fmt(d.date)}</Text>
                    </View>
                    {isCurrent
                      ? <Text style={styles.dayPickerCurrent}>current day</Text>
                      : <Text style={styles.dayPickerArrow}>→</Text>
                    }
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function ActivityCard({ activity: act, trip, dayDate, zoneLabel, leg, autoLocked, originStop, isHighlighted, isFirst, isLast, onMoveUp, onMoveDown, onMarkDone, onEdit, onDelete, onMoveRequest, onSlotMove, onToggleLock, onExploreNearby }) {
  const status    = act.status ?? null;
  const isDone    = status === 'done';
  const isSkipped = status === 'skipped';
  const dimmed    = isDone || isSkipped;
  const dietWarn  = getDietaryWarning(act, trip.families || []);
  // originStop = the prior stop; lets a drive's duration come from the real leg
  // (origin → this stop's destination geocode) instead of the flat 2h default.
  const duration  = estimateDuration(act, originStop);

  // HOURS OF OPERATION (attractions + restaurants) — not a live/today status. Open on
  // this day → that day's hours ("10 AM–4 PM"); closed this day → when it IS open across
  // the week ("Tue–Fri 10 AM–4 PM") instead of a bare red "Closed". Scheduling something
  // while a venue is closed is flagged separately by Trip Check, so the card just informs.
  const showsHours  = act.type === 'activity' || act.type === 'food';
  const hoursWd     = showsHours ? weekdayOf(dayDate) : null;
  const dayHours    = showsHours ? hoursLabel(act.openHours, hoursWd) : '';
  const hoursStr    = !showsHours ? '' : (dayHours && dayHours !== 'Closed' ? dayHours : weeklyHoursLabel(act.openHours));
  const durationLabel = act.type !== 'note' && act.type !== 'stay' && duration > 0
    ? formatDuration(duration)
    : null;

  const hasCoords    = act.lat != null && act.lng != null;
  const hasSecondary = !!(act.detail || act.memo || act.reminder || act.note || act.address || act.url || hasCoords);
  const [cardExpanded, setCardExpanded] = useState(false);

  const famChips = act.costPerPerson > 0 ? trip.families.map(fam => ({
    ...fam, cost: fam.members.length * act.costPerPerson,
  })) : [];

  const isNote         = act.type === 'note';
  const handleMapPress = () => { if (act.mapUrl) Linking.openURL(act.mapUrl); };
  const handleUrlPress = () => { if (act.url)    Linking.openURL(act.url); };

  // ── Thumbnail tap → website / Booking.com (mirrors Discover, adapted) ──
  // Smart SINGLE tap target on the 56px thumbnail: a hotel opens its Booking.com
  // search (the revenue link); everything else opens its own website. The hotel's
  // own site still lives in the ▾ details fold, so both destinations stay reachable.
  // Only when not done/skipped (then the thumbnail is the status glyph) and there's
  // something to open. The labeled rows in details are the screen-reader fallback.
  const bookHref    = bookingUrl(act);                       // null unless a searchable stay
  const thumbAction = !dimmed
    ? (act.type === 'stay' && bookHref ? { url: bookHref, kind: 'book' }
       : act.url                       ? { url: act.url,  kind: 'web'  }
       : null)
    : null;
  // Photo-forward: when a live card has a place photo, show it as a full-bleed hero at the
  // top (the lead column then carries the type icon, not a duplicate thumbnail).
  const heroPhoto      = !!act.photo && !dimmed;
  const isPerFamily    = act.costMode === 'per_family';
  const isTotal        = act.costMode === 'total';
  const displayCostAmt = isPerFamily || isTotal ? act.costAmount : act.costPerPerson;
  const displayCostLbl = isPerFamily ? '/fam' : isTotal ? ' total' : '/p';

  // ── Swipe-to-action: horizontal ScrollView (no PanResponder conflict) ──
  const swipeScrollRef = useRef(null);
  const close = () => swipeScrollRef.current?.scrollTo({ x: 0, animated: true });

  // Swipe-guard for the thumbnail tap: the thumbnail sits at the left swipe-origin
  // edge, so a quick flick (to reveal Move/Delete) can release as a tap. Track the
  // scroll offset and, if the tray is open/being dragged, a thumbnail tap just closes
  // it instead of launching the browser.
  const swipeXRef = useRef(0);
  const handleThumbPress = () => {
    if (swipeXRef.current > 4) { close(); return; }
    if (!thumbAction) return;
    Linking.openURL(thumbAction.url).catch(() => {});
  };

  // Swipe actions are phase-agnostic: this is a planner, so you re-arrange a day whether the
  // trip is upcoming or already underway — the swipe is always Move + Delete. Done/not-done is
  // the checkbox on the card itself (no separate "Did Not Do").
  // One Move entry point for ALL repositioning: reorder within this slot (up/down — only
  // offered when there's room to move), or relocate to another day / time slot.
  const moveChooser = () => {
    close();
    const options = [];
    if (!isFirst) options.push({ text: '⬆️  Move up', onPress: onMoveUp });
    if (!isLast)  options.push({ text: '⬇️  Move down', onPress: onMoveDown });
    options.push({ text: '📅  Another day', onPress: onMoveRequest });
    options.push({ text: '🕒  A different time slot', onPress: onSlotMove });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(`Move “${act.name || 'this stop'}”`, 'Where to?', options);
  };

  return (
    <View style={styles.actCardOuter}>
      <ScrollView
        ref={swipeScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
        snapToOffsets={[0, CARD_ACTIONS_W]}
        decelerationRate="fast"
        scrollEventThrottle={32}
        onScroll={e => { swipeXRef.current = e.nativeEvent.contentOffset.x; }}
        contentContainerStyle={styles.actCardScrollContent}
      >
        {/* ── Card ── */}
        <View
          style={[
            styles.actCard,
            { borderLeftColor: activityColors[act.type] || colors.muted, width: CARD_W },
            isNote        && styles.actCardNote,
            isDone        && styles.actCardDone,
            isSkipped     && styles.actCardSkipped,
            isHighlighted && styles.actCardHighlighted,
          ]}
        >
        {/* ── Hero photo (photo-forward): the place's picture, full-bleed at the top. ONE tap
            target — a hotel opens Booking.com (the revenue link), everything else its website. */}
        {heroPhoto && (
          thumbAction ? (
            <TouchableOpacity activeOpacity={0.9} onPress={handleThumbPress}
              accessibilityRole="link"
              accessibilityLabel={thumbAction.kind === 'book' ? `Book ${act.name || 'this stay'}` : `${act.name || 'this place'} website`}
              accessibilityHint={thumbAction.kind === 'book' ? 'Opens Booking.com in your browser' : 'Opens the website in your browser'}>
              <Image source={{ uri: refreshPhotoKey(act.photo) }} style={styles.actHero} />
              <View style={[styles.heroBadge, thumbAction.kind === 'book' && styles.thumbBookBadge]} pointerEvents="none">
                <Icon name={thumbAction.kind === 'book' ? 'bed-outline' : 'open-outline'} size={12} color="#fff" />
                <Text style={styles.heroBadgeText}>{thumbAction.kind === 'book' ? 'Book' : 'Website'}</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Image source={{ uri: refreshPhotoKey(act.photo) }} style={styles.actHero} />
          )
        )}

        <View style={styles.actCardRow}>
        {/* ── Leading thumbnail: place photo · tinted type icon — ALWAYS shown, even when
            done/skipped (done state is the single corner checkbox, not a glyph here). When
            live & openable it's ONE tap target (hotel → Booking.com, else → website).
            With a hero above, this becomes just the tinted type icon (no duplicate photo). */}
        <View style={styles.actLead}>
          {heroPhoto ? (
            <View style={[styles.actLeadIcon, { backgroundColor: (activityColors[act.type] || colors.muted) + '1A' }]}>
              <Icon name={ACT_ICON[act.type] || 'activity'} size={22} color={activityColors[act.type] || colors.subtle} />
            </View>
          ) : thumbAction ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleThumbPress}
              accessibilityRole="link"
              accessibilityLabel={thumbAction.kind === 'book' ? `Book ${act.name || 'this stay'}` : `${act.name || 'this place'} website`}
              accessibilityHint={thumbAction.kind === 'book' ? 'Opens Booking.com in your browser' : 'Opens the website in your browser'}
            >
              {act.photo ? (
                <Image source={{ uri: refreshPhotoKey(act.photo) }} style={styles.actLeadPhoto} />
              ) : (
                <View style={[styles.actLeadIcon, { backgroundColor: (activityColors[act.type] || colors.muted) + '1A' }]}>
                  <Icon name={ACT_ICON[act.type] || 'activity'} size={22} color={activityColors[act.type] || colors.subtle} />
                </View>
              )}
              <View style={[styles.thumbLinkBadge, thumbAction.kind === 'book' && styles.thumbBookBadge]} pointerEvents="none">
                <Icon name={thumbAction.kind === 'book' ? 'bed-outline' : 'open-outline'} size={11} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : act.photo ? (
            <Image source={{ uri: refreshPhotoKey(act.photo) }} style={styles.actLeadPhoto} />
          ) : (
            <View style={[styles.actLeadIcon, { backgroundColor: (activityColors[act.type] || colors.muted) + '1A' }]}>
              <Icon name={ACT_ICON[act.type] || 'activity'} size={22} color={activityColors[act.type] || colors.subtle} />
            </View>
          )}
        </View>

        {/* ── Body + inline actions ── */}
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.actBody}
            activeOpacity={1}
          >
            {/* Eyebrow — time · duration (transport shows arrival), quiet metadata */}
            {!dimmed && (
              <Text style={styles.actEyebrow} numberOfLines={1}>
                <Text style={styles.actEyebrowTime}>{act.time}</Text>
                {/* A cross-zone leg shows BOTH endpoints' zones (depart in its zone, arrive in
                    the destination's) + true duration + a red-eye/+1-day marker. Otherwise the
                    stop just carries its own zone flag. */}
                {leg
                  ? <Text style={styles.actEyebrowZone}> {leg.departLabel}</Text>
                  : (zoneLabel ? <Text style={styles.actEyebrowZone}> {zoneLabel}</Text> : null)}
                {act.timeLocked ? '  🔒' : (autoLocked ? '  🕒' : '')}
                {leg && act.arriveTime ? (
                  <Text>
                    {'  →  '}{act.arriveTime}<Text style={styles.actEyebrowZone}> {leg.arriveLabel}</Text>
                    {leg.durationMin ? `  ·  ${formatDuration(leg.durationMin)}` : ''}
                    {leg.redEye ? '  🌙 +1 day' : ''}
                  </Text>
                ) : (act.type === 'transport' && !!act.arriveTime ? ` → ${act.arriveTime}` : '')}
                {!leg && durationLabel ? `  ·  ~${durationLabel}` : ''}
              </Text>
            )}
            <View style={styles.actNameRow}>
              <Text style={[
                styles.actName,
                isNote    && styles.actNameNote,
                isDone    && styles.actNameDone,
                isSkipped && styles.actNameSkipped,
              ]} numberOfLines={2}>{act.name}</Text>
              {!!act.rating && !dimmed && (
                <View style={styles.ratingBadge}><Text style={styles.ratingText}>⭐ {act.rating}</Text></View>
              )}
            </View>

            {/* Time + cost subtitle shown only when done/skipped */}
            {dimmed && (
              <Text style={[styles.actDimmedSub, isDone ? styles.actDimmedSubDone : styles.actDimmedSubSkip]}>
                {act.time}{displayCostAmt > 0 ? `  ·  ~$${displayCostAmt}${displayCostLbl}` : ''}
              </Text>
            )}

            {!dimmed && (
              <View style={styles.actTags}>
                {displayCostAmt > 0 && (
                  <View style={[styles.costBadge, isPerFamily && { backgroundColor: colors.smartSoft }, isTotal && { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.costBadgeText, isPerFamily && { color: colors.smart }, isTotal && { color: colors.success }]}>
                      ~${displayCostAmt}{displayCostLbl}
                    </Text>
                  </View>
                )}
                {!!hoursStr && (
                  <View style={styles.hoursBadge}>
                    <Text style={styles.hoursBadgeText}>🕒 {hoursStr}</Text>
                  </View>
                )}
                {!!dietWarn && (
                  <View style={styles.dietWarnBadge}>
                    <Text style={styles.dietWarnBadgeText}>{dietWarn}</Text>
                  </View>
                )}
                {!!act.access && (
                  <View style={[styles.costBadge, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.costBadgeText, { color: colors.success }]}>* {act.access}</Text>
                  </View>
                )}
              </View>
            )}

            {hasSecondary && !isSkipped && (
              <TouchableOpacity style={styles.cardFoldBtn} onPress={() => setCardExpanded(e => !e)}
                activeOpacity={0.6}>
                <Text style={styles.cardFoldText}>{cardExpanded ? '▴ less' : '▾ details'}</Text>
              </TouchableOpacity>
            )}

            {cardExpanded && !isSkipped && (
              <>
                {!!act.detail && <Text style={styles.actDetail}>{act.detail}</Text>}
                {!!act.note && !isNote && (
                  <View style={styles.aiTipRow}>
                    <Text style={styles.aiTipIcon}>💡</Text>
                    <Text style={styles.aiTipText}>{act.note}</Text>
                  </View>
                )}
                {!!act.memo && (
                  <View style={styles.memoRow}>
                    <Text style={styles.memoIcon}>📌</Text>
                    <Text style={styles.memoText}>{act.memo}</Text>
                  </View>
                )}
                {!!act.reminder && (
                  <View style={styles.reminderRow}>
                    <Text style={styles.reminderIcon}>🔔</Text>
                    <Text style={styles.reminderText}>{act.reminder}</Text>
                  </View>
                )}
                {!!act.address && (
                  <TouchableOpacity style={styles.locationRow} onPress={handleMapPress} activeOpacity={0.7}>
                    <Text style={styles.locationIcon}>📍</Text>
                    <Text style={styles.locationText} numberOfLines={1}>{act.address}</Text>
                    {!!act.mapUrl && <Text style={styles.locationArrow}>›</Text>}
                  </TouchableOpacity>
                )}
                {!!act.url && (
                  <TouchableOpacity style={styles.urlRow} onPress={handleUrlPress} activeOpacity={0.7}>
                    <Text style={styles.urlIcon}>🌐</Text>
                    <Text style={styles.urlText} numberOfLines={1}>
                      {act.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </Text>
                    <Text style={styles.locationArrow}>›</Text>
                  </TouchableOpacity>
                )}
                {!!bookHref && (
                  <TouchableOpacity
                    style={styles.urlRow}
                    onPress={() => Linking.openURL(bookHref).catch(() => {})}
                    activeOpacity={0.7}
                    accessibilityRole="link"
                    accessibilityLabel={`Book ${act.name || 'this stay'} on Booking.com`}
                  >
                    <Icon name="bed-outline" size={13} color={colors.accent} />
                    <Text style={[styles.urlText, { color: colors.accent }]} numberOfLines={1}>Book on Booking.com</Text>
                    <Text style={[styles.locationArrow, { color: colors.accent }]}>›</Text>
                  </TouchableOpacity>
                )}
                {hasCoords && !!onExploreNearby && (
                  <TouchableOpacity style={styles.nearbyRow} onPress={onExploreNearby} activeOpacity={0.7}>
                    <Text style={styles.locationIcon}>🧭</Text>
                    <Text style={styles.nearbyText} numberOfLines={1}>Explore nearby places</Text>
                    <Text style={[styles.locationArrow, { color: colors.accent }]}>›</Text>
                  </TouchableOpacity>
                )}
                {famChips.length > 0 && !dimmed && (
                  <>
                    {isTotal && (
                      <Text style={styles.famChipsTotalHint}>
                        💰 ${act.costAmount} shared — each family&apos;s share:
                      </Text>
                    )}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.famChips}>
                        {famChips.map(fam => (
                          <View key={fam.id} style={styles.famChip}>
                            <View style={[styles.famChipDot, { backgroundColor: fam.color }]} />
                            <Text style={styles.famChipText}>{fam.name.split(' ')[0]}: {fmtM(fam.cost)}</Text>
                          </View>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
              </>
            )}
          </TouchableOpacity>

          {/* Bottom action row — edit & move; done is the corner checkbox, delete is via swipe */}
          <View style={styles.actInlineActions}>
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}
              accessibilityRole="button" accessibilityLabel={`Edit ${act.name || 'activity'}`}>
              <Icon name="create-outline" size={16} color={colors.subtle} />
            </TouchableOpacity>
            <TouchableOpacity onPress={moveChooser} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}
              accessibilityRole="button" accessibilityLabel={`Move ${act.name || 'activity'} to another day or time`}>
              <Icon name="calendar-outline" size={15} color={colors.subtle} />
            </TouchableOpacity>
            {act.time && act.type !== 'note' && act.status !== 'done' && act.status !== 'skipped' && (
              <TouchableOpacity onPress={onToggleLock} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}
                accessibilityRole="button" accessibilityLabel={act.timeLocked ? 'Unlock this time so Plan my day can move it' : 'Lock this start time; Plan my day will arrange the other stops around it'}>
                <Icon name={act.timeLocked ? 'lock-closed' : 'lock-open-outline'} size={15} color={act.timeLocked ? colors.primary : colors.subtle} />
              </TouchableOpacity>
            )}
            <Text style={styles.swipeHintText}>← swipe</Text>
          </View>
        </View>

        {/* ── Right column: just the done checkbox (reorder ▲▼ now live in the swipe pad) ── */}
        <View style={styles.reorderCol}>
          {act.type !== 'note' && (
            <TouchableOpacity onPress={onMarkDone} hitSlop={{ top: 8, bottom: 6, left: 8, right: 8 }} activeOpacity={0.6}
              accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}
              accessibilityLabel={isDone ? `Mark ${act.name || 'activity'} not done` : `Mark ${act.name || 'activity'} done`}>
              <Icon name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isDone ? colors.success : colors.subtle} />
            </TouchableOpacity>
          )}
        </View>
        </View>{/* end actCardRow */}
        </View>{/* end actCard */}

        {/* ── Action buttons (revealed when card scrolls left): Move · Delete ──
            Move opens a menu with up/down reorder + relocate to another day/slot.
            Plain touchables — no gesture libs. */}
        <View style={styles.actCardActions}>
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#64748b' }]}
            onPress={moveChooser}
          >
            <Icon name="calendar" size={19} color="#fff" />
            <Text style={styles.actCardActionLabel}>Move</Text>
          </TouchableOpacity>
          {/* Delete — the far-right cell. */}
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#ef4444' }]}
            onPress={() => { close(); onDelete(); }}
          >
            <Icon name="trash-outline" size={19} color="#fff" />
            <Text style={styles.actCardActionLabel}>Delete</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}


// ── Chart & StickyHeader styles ──────────────────────────────────
const ch = StyleSheet.create({
  // Sticky bar (always visible above ScrollView)
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1714',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  miniTripLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  // The active-day block is the row's only flex child. minWidth:0 lets it shrink
  // BELOW its content (RN/Yoga default minWidth is 'auto') so a crowded bar squeezes
  // it instead of letting the cost text paint past its box onto the check chip.
  miniDayBlock: {
    flex: 1,
    minWidth: 0,
  },
  miniDayAmt: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    flexShrink: 1,   // ellipsizes (numberOfLines) instead of overflowing if ever squeezed
  },
  checkChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: radius.full,
    paddingHorizontal: 9, height: 28,
    marginRight: spacing.sm,
    ...shadow.sm,
  },
  checkChipText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  shareBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontSize: 14,
  },
  infoBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
  },
  exportDayBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  exportDayBtnText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '600',
  },

  // Detail sheet (slide-up modal)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1714',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 48,
    maxHeight: '80%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  sheetClose: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '700',
    padding: spacing.xs,
  },
  sheetSummary: {
    marginBottom: spacing.lg,
  },
  sheetTotalAmt: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  sheetTotalSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: spacing.lg,
  },

  // Family cost rows inside detail sheet
  famRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  famCol: {
    flex: 1,
  },
  famName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  famAmt: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.yellow,
  },
  famSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
  },

  // Push to Splitwise button inside sheet
  pushBtn: {
    backgroundColor: colors.green,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  pushBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  resetLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.sm },
  resetRow: { flexDirection: 'row', gap: spacing.sm },
  resetBtn: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: '#fff' },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: colors.text },
  resetBtnAll: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  resetBtnTextAll: { color: colors.danger },
  syncedBadge: {
    backgroundColor: 'rgba(0,184,148,0.18)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,184,148,0.35)',
    marginTop: spacing.lg,
  },
  syncedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.green,
  },

  // Bar chart (TripExpenseChart)
  wrap: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.lg,
  },
  wrapCompact: {
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  totalLine: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  barWrapper: {
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.green,
    marginBottom: 2,
  },
  bar: {
    // width and height set inline
  },
  dayLabels: {
    flexDirection: 'row',
    marginTop: spacing.xs,
  },
  dayLabelText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
  },
  dayLabelActive: {
    color: colors.green,
    fontWeight: '700',
  },
});


const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 100 },

  // ── Cost banner ──────────────────────────────────────────────────
  banner: {
    margin: spacing.xxl,
    marginBottom: 0,
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.xl,
    ...shadow.sm,
  },
  bannerTotal: { marginBottom: spacing.md },
  bannerLabel: { ...typography.caption, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.8 },
  bannerAmt: { fontSize: 32, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  bannerSub: { ...typography.caption, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  bannerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: spacing.md },
  famScroll: { marginBottom: spacing.md },
  famCol: { marginRight: spacing.xl, alignItems: 'center' },
  famName: { ...typography.bodyBold, fontSize: 12 },
  famAmt: { ...typography.caption, color: '#fff', fontWeight: '700' },
  famSub: { ...typography.caption, color: 'rgba(255,255,255,0.4)', fontSize: 10 },

  pushBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pushBtnText: { ...typography.bodyBold, color: '#fff' },
  syncedBadge: {
    backgroundColor: 'rgba(0,184,148,0.18)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,184,148,0.35)',
  },
  syncedBadgeText: { ...typography.caption, color: colors.green, fontWeight: '700' },

  // ── Must-dos strip ───────────────────────────────────────────────
  returnCard: { marginHorizontal: spacing.xxl, marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: '#eef2ff', borderRadius: radius.lg, borderWidth: 1, borderColor: '#c7d2fe' },
  returnTitle: { fontSize: 14, fontWeight: '800', color: '#3730a3' },
  returnBody: { fontSize: 12.5, color: '#4338ca', marginTop: 4, lineHeight: 17 },
  returnEta: { fontSize: 12.5, fontWeight: '700', color: '#3730a3', marginTop: 6 },
  returnBtnRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 10 },
  returnAddBtn: { backgroundColor: '#4f46e5', paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.full },
  returnAddText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  returnDismissBtn: { paddingHorizontal: spacing.sm, paddingVertical: 8 },
  returnDismissText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  mustDosStrip: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
    backgroundColor: '#fffbeb',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  mustDosHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  mustDosTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mustDosTitle:        { fontSize: 12, fontWeight: '700', color: '#92400e' },
  mustDosHideBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3 },
  mustDosDismiss:      { fontSize: 11, color: '#92400e' },
  mustDosAllDone:      { fontSize: 12, color: '#15803d', fontWeight: '700', textAlign: 'center', paddingVertical: 2 },
  mustDosRow:          { gap: spacing.xs },
  mustDosChip: {
    borderWidth: 1.5, borderColor: '#f59e0b', borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5, backgroundColor: '#fff',
  },
  mustDosChipDone:     { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  mustDosChipText:     { fontSize: 12, color: '#92400e', fontWeight: '600' },
  mustDosChipTextDone: { color: '#15803d', textDecorationLine: 'line-through' },

  // ── Day navigation ───────────────────────────────────────────────
  statusPill: { alignSelf: 'center', marginTop: spacing.lg, marginBottom: -spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.full },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  jumpToday: { alignSelf: 'center', marginTop: spacing.sm, marginBottom: -spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  jumpTodayText: { fontSize: 12, fontWeight: '800', color: '#15803d' },
  todayBanner: { marginHorizontal: spacing.xxl, marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
  todayBannerText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  tallyBanner: { marginHorizontal: spacing.xxl, marginTop: spacing.xs, marginBottom: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tallyTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  tallySquare: { marginTop: 5, fontSize: 12, fontWeight: '700', color: '#15803d' },
  tallyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  tallyChip: { fontSize: 12, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.full },
  dayBtnPast: { opacity: 0.45 },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#15803d', marginTop: 3 },
  dayHealthDot: { position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4 },
  dayNav: { marginTop: spacing.xl },
  // Pinned day-switcher bar (stickyHeaderIndices target) — solid bg + hairline so it reads as
  // a fixed bar over scrolling content and the white day pills stay legible.
  dayNavBar: {
    backgroundColor: colors.bg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  dayBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    marginRight: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  dayBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  dayBtnLabel: { ...typography.caption, color: colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  dayBtnLabelActive: { color: colors.primary },
  dayBtnWeekday: { ...typography.caption, color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  dayBtnDate: { ...typography.caption, color: colors.muted, fontSize: 10, marginTop: 1 },
  dayCost: { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 10, marginTop: 1 },

  // ── Day header ───────────────────────────────────────────────────
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dayHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  addActBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addActBtnText: { ...typography.caption, color: '#fff', fontWeight: '800' },
  arrangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.smartSoft, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  btnDisabled: { opacity: 0.45 },
  arrangeBtnText: { ...typography.caption, color: colors.smartDeep, fontWeight: '800' },
  routeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  routeBtnText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
  // Travel leg connector between two stops
  legRow:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 22, marginTop: -2, marginBottom: 4 },
  legDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  legDotTight: { backgroundColor: '#dc2626' },
  legText:     { fontSize: 11, color: colors.subtle, fontWeight: '600' },
  legTextTight:{ color: '#dc2626', fontWeight: '800' },
  dayPill: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7, marginBottom: spacing.sm },
  dayPillText: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  dayWarnings: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  dayWarnChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  dayWarnIcon: { fontSize: 12 },
  dayWarnText: { fontSize: 12, fontWeight: '700' },

  // ── Discover FAB ────────────────────────────────────────────────
  discoverFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  discoverFabText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Check Trip FAB ───────────────────────────────────────────────
  checkFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  checkFabIcon: { fontSize: 15 },
  checkFabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  checkFabBadge: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkFabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // ── Day cost strip ───────────────────────────────────────────────
  costStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.md,
    gap: 0,
  },
  stripItem: { flex: 1, alignItems: 'center' },
  stripLabel: { ...typography.caption, color: colors.muted, fontSize: 10, textTransform: 'uppercase' },
  stripVal: { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  stripDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.sm },

  // ── Family pills ─────────────────────────────────────────────────
  famPills: { flexDirection: 'row', paddingBottom: spacing.md },
  famPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  famDot: { width: 7, height: 7, borderRadius: 4, marginRight: spacing.xs },
  famPillName: { ...typography.caption, color: colors.text, fontWeight: '700', marginRight: 3 },
  famPillAmt: { ...typography.caption, color: colors.muted },

  // ── Activities list ──────────────────────────────────────────────
  activities: { paddingTop: spacing.sm },
  // Derived "where you sleep tonight" footer chip
  lodgeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.smartSoft },
  lodgeChipText: { ...typography.caption, color: colors.smartDeep, fontWeight: '700' },
  lodgeChipMuted: { ...typography.caption, color: colors.subtle },
  lodgeBookLink:  { ...typography.caption, color: colors.accent, fontWeight: '800' },
  // Checkout-day prompt — informational indigo (matches the lodging family), never amber.
  checkoutBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.smartSoft, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  checkoutBannerIcon: { fontSize: 15 },
  checkoutBannerText: { flex: 1, ...typography.smallBold, color: colors.smartDeep },
  checkoutBannerAdd: { ...typography.smallBold, color: colors.smart },
  // Uncovered-night invitation — calm/neutral, NOT amber (it's a question, not a warning)
  lodgeChipAsk: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.smartSoft, borderWidth: 1, borderColor: colors.smart, borderStyle: 'dashed' },
  lodgeAskEmoji: { fontSize: 13 },
  lodgeChipAskText: { ...typography.caption, color: colors.smartDeep, fontWeight: '700' },
  // "How's tonight handled?" resolver sheet
  npOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  npSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xxl, paddingBottom: 36 },
  npHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  npTitle: { ...typography.h4, color: colors.text },
  npSubtitle: { ...typography.caption, color: colors.muted, marginTop: 2, marginBottom: spacing.md },
  npRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', marginTop: spacing.sm, minHeight: 44 },
  npRowActive: { borderColor: colors.smart, backgroundColor: colors.smartSoft },
  npEmoji: { fontSize: 20 },
  npLabel: { ...typography.body, color: colors.text, fontWeight: '700' },
  npSub: { ...typography.caption, color: colors.muted, marginTop: 1 },
  npClear: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: 6 },
  npClearText: { ...typography.caption, color: colors.muted, fontWeight: '700' },
  npAddr: { marginTop: spacing.sm, marginBottom: spacing.xs },
  npAddrHint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs },
  npDone: { alignSelf: 'stretch', marginTop: spacing.md, paddingVertical: 12, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center' },
  npDoneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  // Self-explaining first-leg invite when last night was friends/camping w/o an address
  wakeAskRow: { alignSelf: 'center', marginTop: 4, marginBottom: spacing.xs, paddingVertical: 4, paddingHorizontal: spacing.sm },
  wakeAskText: { ...typography.caption, color: colors.muted },
  wakeAskLink: { ...typography.caption, color: colors.smartDeep, fontWeight: '700' },

  // Day-1 starting-point chip (bookend to lodgeChip) + its empty-state "add" affordance
  originChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.smartSoft },
  originChipText: { ...typography.caption, color: colors.smartDeep, fontWeight: '700', maxWidth: SCREEN_W * 0.6 },
  originAddChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.hairline, borderStyle: 'dashed', backgroundColor: 'transparent' },
  originAddText: { ...typography.caption, color: colors.subtle, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyEmoji: { fontSize: 30, marginBottom: spacing.sm },
  emptyText: { ...typography.h3, color: colors.ink, fontWeight: '800', marginBottom: 4 },
  emptyHint: { ...typography.caption, color: colors.subtle, textAlign: 'center', marginBottom: spacing.lg, maxWidth: 260, lineHeight: 18 },
  emptyAiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.smart,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  emptyAiBtnText: { ...typography.bodyBold, color: '#fff', fontSize: 15 },
  emptyBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  emptyBtnText: { ...typography.bodyBold, color: colors.primary },

  // ── Slot sections ────────────────────────────────────────────────
  // ── Slot sections ────────────────────────────────────────────────
  slotSection: { marginBottom: spacing.lg },
  slotHeader: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  slotHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,   // align under label (past emoji width)
    marginTop: 3,
    flexWrap: 'wrap',
  },
  slotEmoji:    { fontSize: 16, marginRight: spacing.xs },
  slotLabel:    { ...typography.bodyBold, color: colors.text, fontSize: 14, flex: 1 },
  slotMetaText: { fontSize: 11, color: colors.muted },
  slotDoneText: { fontSize: 11, color: '#16a34a', fontWeight: '600' },
  slotSkipText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  slotAddBtn: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginRight: spacing.sm,
  },
  slotAddBtnText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  slotChevron:  { fontSize: 18, color: colors.muted, fontWeight: '600', paddingLeft: 4 },
  slotCollapsedCount: { fontSize: 11, color: colors.primary, fontWeight: '700' },

  // Reorder buttons (▲▼ on card right side)
  reorderCol: {
    justifyContent: 'space-between',   // checkbox pinned top, arrows grouped at the bottom
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  reorderArrows: { alignItems: 'center', gap: 2 },
  reorderBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.2,
  },
  slotEmpty: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  slotEmptyText: { ...typography.caption, color: colors.muted },
  slotCompact: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  slotCompactText: { ...typography.caption, color: colors.muted },
  // Soft time-of-day divider in the chronological timeline (replaces the 4 fixed sections).
  tlDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: spacing.xxl,
    marginTop: spacing.md, marginBottom: spacing.xs,
  },
  tlDividerLabel: { ...typography.caption, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', fontSize: 11 },
  tlDividerLine:  { flex: 1, height: 1, backgroundColor: colors.hairline },
  tlDividerAdd:   { ...typography.caption, color: colors.accent, fontWeight: '700' },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    padding: spacing.md,
  },
  emptySlotIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  emptySlotLabel: { ...typography.bodyBold, color: colors.body },
  emptySlotHint:  { ...typography.caption, color: colors.subtle },
  emptySlotPlus: {
    marginTop: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },

  // ── Activity card ─────────────────────────────────────────────────
  actCardOuter: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  actCardScrollContent: {
    flexDirection: 'row',
  },
  actCardActions: {
    width: CARD_ACTIONS_W,
    flexDirection: 'row',
  },
  actCardAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  actCardActionIcon: {
    fontSize: 22,
    color: '#fff',
  },
  actCardActionLabel: {
    fontSize: 9,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  swipeHintText: {
    fontSize: 9,
    color: colors.muted,
  },
  actCard: {
    // Column wrapper so a full-bleed hero photo can sit above the content row.
    flexDirection: 'column',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  // The content row (lead · body · done) — padding lives here now, so the hero is edge-to-edge.
  actCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  // Photo-forward hero — the place's picture, full-bleed at the top of the card.
  actHero: { width: '100%', height: 150, backgroundColor: colors.surface2 },
  heroBadge: {
    position: 'absolute', right: spacing.sm, bottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.full,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  actCardNote:    { backgroundColor: colors.yellowLight, borderColor: '#f0d080' },
  actCardDone:    { backgroundColor: '#f0fdf4', borderLeftColor: '#22c55e', borderColor: '#bbf7d0' },
  actCardSkipped: { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderColor: '#fecaca' },
  actCardDragging: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  actCardHighlighted: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: colors.primaryLight,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },

  // Checkbox
  checkboxCol: { paddingTop: 2 },
  checkbox: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone:    { backgroundColor: colors.green,  borderColor: colors.green },
  checkboxSkipped: { backgroundColor: colors.muted,  borderColor: colors.muted },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Leading thumbnail (place photo / tinted type icon / status)
  actLead:       { width: 56, alignItems: 'center', justifyContent: 'center' },
  actLeadPhoto:  { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surface2 },
  actLeadIcon:   { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  thumbLinkBadge:{ position: 'absolute', right: -3, bottom: -3, width: 19, height: 19, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface },
  thumbBookBadge:{ backgroundColor: colors.accent },
  actEyebrow:    { ...typography.caption, color: colors.subtle, marginBottom: 1 },
  actEyebrowTime:{ color: colors.primary, fontWeight: '800' },
  actEyebrowZone:{ color: colors.smart, fontWeight: '800' },
  actTimeCol:    { alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  actThumb:      { width: 38, height: 38, borderRadius: 9, marginTop: 5, backgroundColor: colors.surface2 },
  actTime:       { ...typography.caption, color: colors.primary, fontWeight: '700' },
  actIcon:       { fontSize: 18, marginTop: 3 },
  actArriveTime: { fontSize: 9, color: colors.muted, fontWeight: '600', marginTop: 3 },
  actStatusEmoji:{ fontSize: 26 },

  // Dimmed subtitle (time + cost shown under name when done/skipped)
  actDimmedSub:      { fontSize: 11, marginTop: 2, marginBottom: 2 },
  actDimmedSubDone:  { color: '#16a34a' },
  actDimmedSubSkip:  { color: '#dc2626' },

  // Body
  actBody:    {},  // flex:1 lives on the wrapper View now
  actNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 3 },
  actName:    { ...typography.bodyBold, color: colors.text, flex: 1 },
  actNameNote:    { color: colors.muted, fontStyle: 'italic' },
  actNameDone:    { color: '#16a34a' },
  actNameSkipped: { color: '#dc2626', textDecorationLine: 'line-through' },
  actDetail:  { ...typography.caption, color: colors.muted, marginBottom: spacing.xs },
  actTags:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },

  // Badges
  costBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  costBadgeText: { fontSize: 11, fontWeight: '800', color: colors.accent },
  durationBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  durationBadgeText: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  hoursBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: '#eef2f6',
    borderWidth: 1,
    borderColor: '#cdd7e1',
  },
  hoursBadgeText: { fontSize: 11, color: '#516072', fontWeight: '600' },
  dietWarnBadge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: '#fef9c3',
    borderWidth: 1,
    borderColor: '#fde047',
  },
  dietWarnBadgeText: { fontSize: 11, color: '#713f12', fontWeight: '700' },
  ratingBadge: {
    backgroundColor: colors.yellowLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ratingText: { fontSize: 11, color: '#9b6e00', fontWeight: '600' },

  // Fold / expand
  cardFoldBtn: { marginTop: spacing.xs },
  cardFoldText: { ...typography.caption, color: colors.primary },

  // Expanded secondary content
  aiTipRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  aiTipIcon:   { fontSize: 13, marginTop: 1 },
  aiTipText:   { ...typography.caption, color: colors.ai, flex: 1, fontStyle: 'italic' },
  memoRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  memoIcon:    { fontSize: 13, marginTop: 1 },
  memoText:    { ...typography.caption, color: colors.muted, flex: 1 },
  reminderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.xs },
  reminderIcon:{ fontSize: 13, marginTop: 1 },
  reminderText:{ ...typography.caption, color: '#d97706', flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  locationIcon:{ fontSize: 13 },
  locationText:{ ...typography.caption, color: colors.primary, flex: 1 },
  locationArrow:{ ...typography.caption, color: colors.primary, fontWeight: '700' },
  urlRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  urlIcon:     { fontSize: 13 },
  urlText:     { ...typography.caption, color: colors.primary, flex: 1 },
  nearbyRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  nearbyText:  { ...typography.caption, color: colors.accent, fontWeight: '700', flex: 1 },

  // Family chips
  famChips:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  famChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  famChipDot:       { width: 6, height: 6, borderRadius: 3 },
  famChipText:      { fontSize: 11, color: colors.muted },
  famChipsTotalHint:{ ...typography.caption, color: colors.muted, marginTop: spacing.xs, fontStyle: 'italic' },

  // Status badges (Done / Skipped)
  statusBadgeDone: { backgroundColor: '#dcfce7', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.xs, alignSelf: 'flex-start' },
  statusBadgeSkip: { backgroundColor: '#fee2e2', borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, marginBottom: spacing.xs, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  // Right column — ↑↓ only
  actReorderCol: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  reorderBtnText: { fontSize: 15, color: colors.muted },

  // Horizontal action row at bottom of card body — ✏️ 📅 🗑
  actInlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  editBtnText: { fontSize: 15 },
  moveBtnText: { fontSize: 15 },
  delBtnText:  { fontSize: 15 },

  // Kept for compatibility (no longer used)
  actActions:          {},
  actActionBtn:        {},
  actActionBtnDisabled:{ opacity: 0.25 },

  // Reorder hint bar
  // "Doesn't fit this day" tray — amber, loud-but-calm (a placement problem with an easy fix).
  noFitTray: {
    marginHorizontal: spacing.xxl, marginBottom: spacing.md,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    borderRadius: radius.lg, padding: spacing.md,
  },
  noFitTitle: { ...typography.bodyBold, color: '#92400e' },
  noFitSub:   { ...typography.caption, color: '#a16207', marginTop: 2, marginBottom: spacing.sm },
  noFitRow:   { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#fef3c7' },
  noFitName:  { ...typography.body, color: colors.text, fontWeight: '700' },
  noFitHours: { ...typography.caption, color: colors.subtle, marginTop: 1 },
  noFitActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 8 },
  noFitMoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#d97706', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7 },
  noFitMoveText: { color: '#fff', fontWeight: '800', fontSize: 12.5 },
  noFitGhostBtn: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 7, borderWidth: 1, borderColor: '#fcd34d' },
  noFitGhostText: { color: '#a16207', fontWeight: '800', fontSize: 12.5 },
  reorderHintBar: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
  reorderHintText: { ...typography.caption, color: colors.primary, textAlign: 'center' },

  // Day picker modal
  dayPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  dayPickerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xxl,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  dayPickerHandle: { width: 36, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg },
  dayPickerTitle:  { ...typography.h4, color: colors.text, marginBottom: spacing.lg },
  dayPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayPickerRowCurrent: { opacity: 0.45 },
  dayPickerLabel:        { ...typography.bodyBold, color: colors.text },
  dayPickerLabelCurrent: { color: colors.primary },
  dayPickerDate:   { ...typography.caption, color: colors.muted, marginTop: 2 },
  dayPickerCurrent:{ ...typography.caption, color: colors.primary, fontWeight: '700' },
  dayPickerArrow:  { fontSize: 18, color: colors.muted },
});
