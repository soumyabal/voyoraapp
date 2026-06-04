import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Dimensions, Alert, Linking, Modal, Share, Image, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import DiscoverModal from '../modals/DiscoverModal';
import SetOriginModal from '../modals/SetOriginModal';
import { APP_NAME } from '../config';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import Icon from '../components/ui/Icon';
import Snackbar from '../components/ui/Snackbar';
import { fmt, fmtM, getActivityIcon, uid, tripPhase, defaultDayFor, daysBetweenISO, todayISO, nowNextOf } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost } from '../utils/costs';
import { validateTrip, summariseWarnings, estimateDuration, formatDuration, lodgingForNight, dayStartAnchor } from '../utils/tripValidator';
import { googleMapsDayUrl } from '../utils/mapsRoute';
import { scheduleDay, planDay } from '../utils/autoArrange';
import { travelLeg, formatKm } from '../utils/geo';
import { weekdayOf, isOpenAt, hoursLabel } from '../utils/hours';
import { fetchPlacePhoto } from '../utils/places';
import { exportDayAsPDF } from '../utils/exportPlan';
import LocationSearchField from '../components/ui/LocationSearchField';

// ─── Dietary warning helper ───────────────────────────────────────
const MEAT_WARN_RE = /\b(beef|pork|lamb|chicken|mutton|fish|prawn|shrimp|seafood|lobster|crab|sashimi|sushi|steak|burger|bbq|barbecue|bacon|ham|meat|non.?veg)\b/i;
const ALCO_WARN_RE = /\b(beer|wine|cocktail|whisky|whiskey|vodka|rum|gin|spirits|alcohol|brewery|pub|bar|tavern|champagne|prosecco|sake)\b/i;

function getDietaryWarning(act, families = []) {
  if (act.type !== 'food') return null;
  const text     = `${act.name} ${act.detail || ''}`;
  const vegFams  = families.filter(f => (f.dietary || []).some(d => d === 'vegetarian' || d === 'vegan'));
  const alcoFams = families.filter(f => (f.dietary || []).includes('no-alcohol'));
  if (vegFams.length > 0 && MEAT_WARN_RE.test(text)) return '⚠️ May contain meat';
  if (alcoFams.length > 0 && ALCO_WARN_RE.test(text)) return '⚠️ Alcohol';
  return null;
}

// ─── WhatsApp day share text ──────────────────────────────────────
const SLOT_RANGES = [
  { key: 'morning',   label: '🌅 Morning',   before: 720  },
  { key: 'afternoon', label: '☀️ Afternoon',  before: 1020 },
  { key: 'evening',   label: '🌆 Evening',    before: 1260 },
  { key: 'night',     label: '🌙 Night',      before: 1440 },
];

function generateDayShareText(trip, day) {
  if (!day) return '';
  const acts = [...(day.activities || [])]
    .filter(a => a.status !== 'skipped')
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  const toMin = t => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
  const getSlot = t => {
    const m = toMin(t);
    return SLOT_RANGES.find(s => m < s.before)?.key ?? 'night';
  };

  const bySlot = {};
  acts.forEach(a => {
    const sk = getSlot(a.time);
    if (!bySlot[sk]) bySlot[sk] = [];
    bySlot[sk].push(a);
  });

  const dayCost = acts.reduce((s, a) => s + (a.costPerPerson || 0), 0);

  let text = `*${trip.name}* — ${day.label} (${fmt(day.date)})\n📍 ${trip.destination}\n\n`;

  SLOT_RANGES.forEach(({ key, label }) => {
    if (!bySlot[key]?.length) return;
    text += `${label}\n`;
    bySlot[key].forEach(a => {
      const icon = a.type === 'food' ? '🍽️' : a.type === 'transport' ? '🚗' : a.type === 'stay' ? '🏨' : '🎯';
      const cost = a.costPerPerson > 0 ? ` (~$${a.costPerPerson}/p)` : '';
      text += `  ${a.time}  ${icon} ${a.name}${cost}\n`;
    });
    text += '\n';
  });

  if (dayCost > 0) text += `💰 Day estimate: ${fmtM(dayCost)}/person\n`;
  text += `\n_Shared via ${APP_NAME}_`;
  return text;
}

const SCREEN_W       = Dimensions.get('window').width;
const CARD_ACTIONS_W = 216;                        // 3 × 72px action buttons
const CARD_W         = SCREEN_W - 48;              // SCREEN_W - 2 × spacing.xxl (24)

// ── Day template: time slots ──────────────────────────────────────
const DAY_SLOTS = [
  { key: 'morning',   emoji: '🌅', icon: 'partly-sunny-outline', tint: '#e09a37', label: 'Morning',   hint: 'Before noon',   defaultTime: '09:00', range: [0,   720]  },
  { key: 'afternoon', emoji: '☀️',  icon: 'sunny',                tint: '#e0843c', label: 'Afternoon', hint: '12 pm – 5 pm',  defaultTime: '13:00', range: [720, 1020] },
  { key: 'evening',   emoji: '🌆', icon: 'cloudy-night-outline', tint: '#c2683f', label: 'Evening',   hint: '5 pm – 9 pm',   defaultTime: '18:00', range: [1020,1260] },
  { key: 'night',     emoji: '🌙', icon: 'moon',                 tint: '#6c5ce7', label: 'Night',     hint: 'After 9 pm',    defaultTime: '21:00', range: [1260,1440] },
];

// Activity type → Icon name (see components/ui/Icon)
const ACT_ICON = { transport: 'transport', stay: 'hotel', food: 'food', activity: 'activity', note: 'note' };
// Trip Check severity → sort rank + inline chip palette (errors first).
const SEV_RANK = { error: 0, warning: 1, info: 2 };
const SEV_CHIP = {
  error:   { backgroundColor: '#fef2f2', color: '#dc2626' },
  warning: { backgroundColor: '#fffbeb', color: '#b45309' },
  info:    { backgroundColor: '#f0ede8', color: '#6b6259' },
};

// One calm per-day summary pill (replaces the wall of red chips). Tone is set by
// the worst severity present; the icon SHAPE + the words carry severity (not just
// colour — WCAG 1.4.1). Deliberately soft: even "to fix" is amber, never alarm-red.
// Trip-phase status pill tones (before/during/after)
const PILL_TONE = {
  upcoming: { bg: '#eef2ff', fg: '#4f46e5' },  // anticipatory
  active:   { bg: '#dcfce7', fg: '#15803d' },  // live green
  past:     { bg: '#f1f5f9', fg: '#64748b' },  // settled / muted
};

const DAY_PILL = {
  fix:   { bg: '#fdf3e2', fg: '#b45309', icon: 'warning-outline' },          // a genuine conflict
  check: { bg: '#fdf3e2', fg: '#b45309', icon: 'information-circle-outline' },// real, worth a look
  tip:   { bg: '#eef1f4', fg: '#5b6470', icon: 'bulb-outline' },             // soft heuristic heads-up
  ok:    { bg: '#e9f7f0', fg: '#0e9f6e', icon: 'checkmark-circle' },         // all good
};

// A day slot ↔ the meal you'd eat at the hotel in it (in-room dining / hotel
// restaurant) — handy when the group is tired or unwell and doesn't want to go out.
const SLOT_MEAL  = { morning: 'breakfast', afternoon: 'lunch', evening: 'dinner' };
const MEAL_LABEL = {
  breakfast: { emoji: '🍳', label: 'Breakfast', time: '08:00' },
  lunch:     { emoji: '🥪', label: 'Lunch',     time: '12:30' },
  dinner:    { emoji: '🍽️', label: 'Dinner',    time: '19:00' },
};

// "How's tonight handled?" — a hotel-less night the user tells us is covered.
// The resolver sheet rows (with plain-language subtitles)…
// `located` reasons have a real address worth capturing (optionally) to anchor the
// next morning's drive; the others have no fixed place (overnight = in motion;
// heading home → the trip's origin, derived).
const NIGHT_PLAN_OPTIONS = [
  { key: 'overnight_travel', emoji: '🌙', label: 'Travelling overnight', sub: 'red-eye, sleeper train, night drive', located: false },
  { key: 'with_friends',     emoji: '🛋️', label: 'Staying with friends or family', sub: null, located: true },
  { key: 'camping',          emoji: '⛺', label: 'Camping or RV', sub: null, located: true },
  { key: 'heading_home',     emoji: '🏡', label: 'Heading home tonight', sub: null, located: false },
];
// …and the calm settled chip each one becomes on the day card (icon = the in-app Icon name).
const NIGHT_PLAN_META = {
  overnight_travel: { emoji: '🌙', icon: 'transport', label: 'Overnight travel · no hotel needed', a11y: 'travelling overnight' },
  with_friends:     { emoji: '🛋️', icon: 'people',    label: 'Staying with friends',              a11y: 'staying with friends or family' },
  camping:          { emoji: '⛺', icon: 'tent',      label: 'Camping tonight',                   a11y: 'camping' },
  heading_home:     { emoji: '🏡', icon: 'location',  label: 'Home tonight',                      a11y: 'heading home' },
};

function getSlotKey(timeStr) {
  if (!timeStr) return 'morning';
  const [h, m] = timeStr.split(':').map(Number);
  const mins = (h || 0) * 60 + (m || 0);
  if (mins < 720)  return 'morning';
  if (mins < 1020) return 'afternoon';
  if (mins < 1260) return 'evening';
  return 'night';
}

const toMin = t => { const [h, m] = (t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };

// ── Travel leg between two consecutive stops ──────────────────────
// The intuitive distance cue: a little "🚗 12 min · 5.0 km" connector between
// cards (Wanderlog/Google-Trips style). Turns RED when the next stop starts
// before you could realistically get there — the same call the Trip Check rule
// makes, so the inline cue and the warning always agree.
function TravelConnector({ from, to }) {
  const leg = travelLeg(from, to);
  if (!leg || leg.min < 3) return null;            // unknown coords or a trivial hop
  const gap   = toMin(to.time) - (toMin(from.time) + estimateDuration(from));
  const tight = leg.min >= 10 && gap < leg.min;    // not enough time to travel (close OR overlapping)
  const gapNote = !tight ? '' : gap < 0 ? ' — overlaps' : ` — only ${gap} min gap`;
  return (
    <View style={styles.legRow}>
      <View style={[styles.legDot, tight && styles.legDotTight]} />
      <Text style={[styles.legText, tight && styles.legTextTight]} numberOfLines={1}>
        {leg.mode === 'walk' ? '🚶' : '🚗'} {leg.min} min · {formatKm(leg.km)}{gapNote}
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
          ? `🧭 ${formatKm(leg.km)} to your first stop`
          : `${leg.mode === 'walk' ? '🚶' : '🚗'} ${leg.min} min · ${formatKm(leg.km)} to your first stop`}
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
function StickyHeader({ trip, currentDay, onSelectDay, onPush, onCheckTrip, onResetDay, onResetAll }) {
  const [showDetail, setShowDetail] = useState(false);
  const itinTotal = calcTripItineraryTotal(trip);
  const day     = trip.days[currentDay];
  const dayCost = day ? calcDayCostForTrip(day, trip) : 0;
  const dayPP   = day ? calcDayPerPersonCost(day) : 0;

  const handleShare = async () => {
    try {
      const text = generateDayShareText(trip, day);
      await Share.share({ message: text });
    } catch (e) {
      console.warn('[share]', e);
    }
  };

  return (
    <>
      {/* ── Sticky bar ── */}
      <View style={ch.stickyBar}>
        {/* Trip total */}
        <View>
          <Text style={ch.miniTripLabel}>TRIP TOTAL</Text>
          <Text style={ch.miniTripAmt}>{itinTotal > 0 ? fmtM(itinTotal) : '—'}</Text>
        </View>

        <View style={ch.miniSep} />

        {/* Active day */}
        <View style={{ flex: 1 }}>
          <Text style={ch.miniTripLabel}>{day?.label?.toUpperCase() || 'DAY'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={ch.miniDayAmt}>{dayCost > 0 ? fmtM(dayCost) : '—'}</Text>
            {dayCost > 0 && <Text style={ch.miniPP}>{fmtM(dayPP)}/p</Text>}
          </View>
        </View>

        {/* Trip health — THREE honest states (a green ✓ is EARNED, not the default):
              · amber + count → a genuine, provable conflict to fix
              · neutral "…"   → planned-so-far is clean but the trip ISN'T finished
                                (a blank/half-built trip — calm, never an alarm)
              · green ✓        → every (interior) day planned AND no conflicts
            Reserving green stops a half-empty trip from claiming "all set", without
            re-introducing red/amber alarm on a fresh trip (neutral can't scare). */}
        {!!onCheckTrip && (() => {
          const ignored = trip.ignoredWarnings || [];
          const conflicts = validateTrip(trip)
            .filter(w => w.severity === 'error' && !ignored.includes(`${w.type}:${w.dayIndex ?? 'trip'}`))
            .length;
          // Green ✓ is earned only when EVERY day has real content AND there's no
          // conflict — so the checkmark never contradicts a half-empty trip. A
          // day with just a note (rest day) doesn't count as planned.
          const isPlanned   = d => d.activities.some(a => a.status !== 'skipped' && a.type !== 'note');
          const totalDays   = trip.days.length;
          const plannedDays = trip.days.filter(isPlanned).length;

          let bg, icon, label;
          if (conflicts > 0) {
            bg = colors.warn;    icon = 'warning-outline';
            label = `Trip check: ${conflicts} thing${conflicts > 1 ? 's' : ''} to fix`;
          } else if (plannedDays < totalDays) {
            bg = colors.subtle;  icon = 'more';
            label = plannedDays === 0
              ? 'Trip check: nothing planned yet'
              : `Trip check: ${plannedDays} of ${totalDays} days planned, no conflicts so far`;
          } else {
            bg = colors.success; icon = 'checkmark-circle';
            label = `Trip check: all ${totalDays} days planned, no conflicts`;
          }
          return (
            <TouchableOpacity
              style={[ch.checkChip, { backgroundColor: bg }]}
              onPress={onCheckTrip}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Icon name={icon} size={13} color="#fff" />
              {conflicts > 0 && <Text style={ch.checkChipText}>{conflicts}</Text>}
            </TouchableOpacity>
          );
        })()}

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
              onPress={() => { setShowDetail(false); exportDayAsPDF(trip, day); }}
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
  const { currentDay, setCurrentDay, addActivity, deleteActivity, updateActivity, pushItineraryToSplitwise, markActivityStatus, moveActivity, reorderActivity, reorderSlotActivities, setDayActivities, resetDayActivities, resetAllActivities, restoreTripState, setActivityPhoto, markPlanDayNoteSeen, setNightPlan } = useStore();
  const planDayNoteSeen = useStore(s => s.planDayNoteSeen);
  const [showAddActivity,       setShowAddActivity]       = useState(false);
  const [editActivity,          setEditActivity]          = useState(null);
  const [manualSeed,            setManualSeed]            = useState(null);   // {name?,address?,lat?,lng?,tile?} prefill when manual is opened from the Discover bridge / a dropped pin
  const [defaultSlotTime,       setDefaultSlotTime]       = useState('09:00');
  const [showDiscover,          setShowDiscover]          = useState(false);
  const [nightPlanDay,          setNightPlanDay]          = useState(null);  // dayIndex whose "how's tonight handled?" sheet is open
  const [discoverNear,          setDiscoverNear]          = useState(null);  // {lat,lng,label} when opened from an activity
  const [discoverSlot,          setDiscoverSlot]          = useState(null);  // slot key when Discover opened from a per-slot "+ Add"
  const [showOrigin,            setShowOrigin]            = useState(false); // SetOriginModal (Day-1 starting point)
  const [movingAct,             setMovingAct]             = useState(null);
  const [snack,                 setSnack]                 = useState(null);  // undo toast
  const snackTimer = useRef(null);
  useEffect(() => () => clearTimeout(snackTimer.current), []);
  const [reorderHint,           setReorderHint]           = useState(false);
  const [collapsedSlots,        setCollapsedSlots]        = useState({});
  const [mustDosDismissed,      setMustDosDismissed]      = useState(false);
  const [mustDosChecked,        setMustDosChecked]        = useState({});

  const toggleSlot = (key) =>
    setCollapsedSlots(prev => ({ ...prev, [key]: !prev[key] }));

  // Show a brief hint after any reorder, then auto-dismiss
  const handleReorder = (actId, direction, slotActs) => {
    // Swap TIME VALUES between the two adjacent activities in sorted slot order.
    // (Swapping array positions doesn't work because rendering re-sorts by time.)
    const idx = slotActs.findIndex(a => a.id === actId);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= slotActs.length) return;
    const timeA = slotActs[idx].time;
    const timeB = slotActs[swapIdx].time;
    updateActivity(trip.id, actId, { time: timeB });
    updateActivity(trip.id, slotActs[swapIdx].id, { time: timeA });
    setReorderHint(true);
    setTimeout(() => setReorderHint(false), 3000);
  };

  const day = trip.days[currentDay] || trip.days[0];

  // Trip lifecycle: phase + the calendar "today" day index (active trips only), used
  // by the status pill and the phase-aware day chips.
  const phase    = tripPhase(trip);
  const todayIdx = phase === 'active' ? defaultDayFor(trip) : -1;
  const statusPill = (() => {
    if (phase === 'upcoming') {
      const n = daysBetweenISO(todayISO(), trip.startDate);
      return { tone: 'upcoming', text: n <= 0 ? '📅 Starts today' : n === 1 ? '📅 Tomorrow' : `📅 In ${n} days` };
    }
    if (phase === 'active') return { tone: 'active', text: `🟢 Day ${todayIdx + 1} of ${trip.days.length} · today` };
    if (phase === 'past')   return { tone: 'past', text: '✓ Trip complete' };
    return null;
  })();
  // Live-trip "Today" lens: are we viewing today, and what's now/next.
  const isToday = phase === 'active' && currentDay === todayIdx;
  const nowMin  = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

  // Where you woke today (Day 1 → origin; else last night's hotel / friends-camping
  // address / home). Drives the first-stop travel leg for ANY day, not just Day 1.
  const startAnchor = day ? dayStartAnchor(trip, currentDay) : null;
  // A located night (friends/camping) with NO address yet → we can't map the morning;
  // offer to add it instead of silently dropping the first leg.
  const priorNight = (day && currentDay > 0) ? lodgingForNight(trip, currentDay - 1) : null;
  const priorNightNeedsAddr = !startAnchor && !!priorNight?.nightPlan
    && ['with_friends', 'camping'].includes(priorNight.nightPlan.type)
    && priorNight.nightPlan.lat == null;

  // Backfill place photos for this day's stops that don't have one yet (added
  // before we stored photos / via the AI planner), so the cards show a thumbnail.
  // One cached Places lookup per place; guarded so we never refetch.
  const photoTriedRef = useRef(new Set());
  useEffect(() => {
    (day?.activities || []).forEach(act => {
      if (act.photo || act.lat == null || act.lng == null) return;
      if (act.type !== 'activity' && act.type !== 'food' && act.type !== 'stay') return;
      if (photoTriedRef.current.has(act.id)) return;
      photoTriedRef.current.add(act.id);
      fetchPlacePhoto(act.name, act.lat, act.lng)
        .then(photo => { if (photo) setActivityPhoto(trip.id, act.id, photo); })
        .catch(() => {});
    });
  }, [trip.id, currentDay, day?.activities?.length]);

  // Trip Check warnings for THIS day — surfaced inline so "arrange → see what's
  // still off" is one glance. Memoised so validateTrip doesn't run every render.
  const dayWarnings = React.useMemo(() => {
    const ignored = trip.ignoredWarnings || [];
    return validateTrip(trip)
      .filter(w => w.dayIndex === currentDay && !ignored.includes(`${w.type}:${w.dayIndex ?? 'trip'}`))
      .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  }, [trip, currentDay]);

  const handlePush = () => { pushItineraryToSplitwise(trip.id); switchTab('splitwise'); };

  const openEdit       = (act)  => { setEditActivity(act); setShowAddActivity(true); };
  // Manual editor — the deliberate "enter your own" path (transport, custom, per-family
  // cost). `seed` ({name?,address?,lat?,lng?,tile?}) prefills it — used by the Discover
  // "add manually" bridge (name) and a dropped map pin (lat/lng → Stay default).
  const openManual     = (seed = null, time = '09:00') => { setManualSeed(seed); setDefaultSlotTime(time); setEditActivity(null); setShowAddActivity(true); };
  const openAdd        = ()     => openManual(null, '09:00');
  // Per-slot "+ Add" is now SEARCH-FIRST: it opens Discover scoped to that slot
  // (manual is one tap away via the header button / the Discover "add manually" bridge).
  const openAddInSlot  = (time) => { setDiscoverNear(null); setDiscoverSlot(getSlotKey(time)); setDefaultSlotTime(time); setShowDiscover(true); };

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
  const addHotelFromNightPlan = () => { setNightPlanDay(null); setDiscoverNear(null); setDiscoverSlot(null); setShowDiscover(true); };
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
    setShowDiscover(true);
  };

  const cycleStatus = (act) => {
    const next = !act.status ? 'done' : act.status === 'done' ? 'skipped' : null;
    markActivityStatus(trip.id, act.id, next);
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
    const prev = day.activities;
    const dayRole = currentDay === trip.days.length - 1 ? 'departure' : 'normal';
    // Anchor to where you wake: Day 1 → trip.origin; later days → last night's hotel.
    const anchor = dayStartAnchor(trip, currentDay) || undefined;
    const r = planDay(day.activities, {
      dayRole, date: day.date, anchor, pace: trip.pace, families: trip.families, origin: trip.origin,
    });
    setDayActivities(trip.id, currentDay, r.scheduled);
    const undo = () => setDayActivities(trip.id, currentDay, prev);

    // First time only: gently explain the rules are built in (replaces the result toast).
    if (!planDayNoteSeen) {
      markPlanDayNoteSeen();
      Alert.alert(
        '✨ Planned for you',
        `I ordered this day by opening hours, travel time, and your ${trip.pace} pace — the planning rules are built in. Tweak anything you like; nothing is locked.`,
        [{ text: 'Got it' }],
      );
      return;
    }

    // Stable end-state: nothing moved → calm acknowledgement, never a re-prompt.
    if (!r.changed) {
      const calm = (r.overflow.length || r.unresolved.length)
        ? 'Already arranged · see Trip Check to fine-tune'
        : 'Day already looks good ✓';
      showUndoAction(calm, 'sparkles', undo);
      return;
    }

    // Something changed → say what happened, including the honest residual.
    const bits = [];
    if (r.overflow.length)   bits.push(`${r.overflow.length} may not fit a ${trip.pace} day`);
    if (r.unresolved.length) bits.push(`${r.unresolved.length} closed then`);
    showUndoAction(
      bits.length ? `Day planned · ${bits.join(' · ')}` : 'Day planned · ordered by hours & travel',
      'sparkles',
      undo,
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
  // Tired or unwell days → one tap to eat in. Breakfast uses LAST night's hotel
  // (you wake there); lunch/dinner use TONIGHT's hotel (where you're staying).
  // Free by default — the user can add a room-service cost on the card.
  const wokeAtHotel  = currentDay > 0 ? lodgingForNight(trip, currentDay - 1) : null;
  const tonightHotel = lodgingForNight(trip, currentDay);
  const hotelForMeal = {
    breakfast: wokeAtHotel?.stay || null,                       // where you woke up
    lunch:     tonightHotel?.stay || wokeAtHotel?.stay || null, // staying tonight, or pre-checkout
    dinner:    tonightHotel?.stay || null,                      // only where you sleep tonight
  };
  const dayMealPresent = (meal) => (day?.activities || []).some(a =>
    a.type === 'food' && a.status !== 'skipped' &&
    (a.meal === meal || (meal === 'breakfast' && /breakfast|brunch/i.test(a.name || ''))));
  const addHotelMeal = (meal) => {
    const stay = hotelForMeal[meal];
    if (!stay) return;
    const { label, time } = MEAL_LABEL[meal];
    const id = uid();
    addActivity(trip.id, currentDay, {
      id, type: 'food', time,
      name: `${label} at ${stay.name}`, detail: 'In-room dining',
      meal, atHotel: true,
      costPerPerson: 0, costMode: 'per_person', costAmount: 0,
      address: stay.address || '', url: stay.url || '',
      lat: stay.lat ?? null, lng: stay.lng ?? null,
      note: null, status: null,
    });
    showUndoAction(`${label} added at the hotel`, 'food', () => deleteActivity(trip.id, id));
  };
  // The in-room-dining chip for a given slot (or null when there's no hotel /
  // that meal is already planned).
  const renderHotelMealChip = (slotKey) => {
    const meal = SLOT_MEAL[slotKey];
    const stay = meal ? hotelForMeal[meal] : null;
    if (!stay || dayMealPresent(meal)) return null;
    const { emoji, label } = MEAL_LABEL[meal];
    return (
      <TouchableOpacity style={styles.bfastChip} onPress={() => addHotelMeal(meal)} activeOpacity={0.8}>
        <Text style={styles.bfastChipText} numberOfLines={1}>{emoji}  {label} at {stay.name}</Text>
        <Text style={styles.bfastChipAdd}>+ Add</Text>
      </TouchableOpacity>
    );
  };

  // Direct-status setters for swipe actions (toggle off if already set) + undo toast.
  const setDone = (act) => {
    const prev = act.status ?? null;
    const next = prev === 'done' ? null : 'done';
    markActivityStatus(trip.id, act.id, next);
    showUndo(next === 'done' ? 'Marked as done' : 'Marked as not done',
             next === 'done' ? 'checkmark-circle' : 'ellipse-outline', act.id, prev);
  };
  const setSkipped = (act) => {
    const prev = act.status ?? null;
    const next = prev === 'skipped' ? null : 'skipped';
    markActivityStatus(trip.id, act.id, next);
    showUndo(next === 'skipped' ? "Marked as didn't do" : 'Status cleared',
             next === 'skipped' ? 'close-circle' : 'ellipse-outline', act.id, prev);
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
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Trip status pill — before / during / after (📅 In 8 days · 🟢 Day 2 of 3 · today · ✓ Trip complete) */}
        {statusPill && (
          <View style={[styles.statusPill, { backgroundColor: PILL_TONE[statusPill.tone].bg }]}
            accessibilityRole="text" accessibilityLabel={statusPill.text.replace(/^[^\w]+/, '')}>
            <Text style={[styles.statusPillText, { color: PILL_TONE[statusPill.tone].fg }]}>{statusPill.text}</Text>
          </View>
        )}

        {/* Live trip, but you've navigated off today → one tap back to now */}
        {phase === 'active' && !isToday && (
          <TouchableOpacity style={styles.jumpToday} onPress={() => setCurrentDay(todayIdx)} activeOpacity={0.8}
            accessibilityRole="button" accessibilityLabel={`Jump to today, Day ${todayIdx + 1}`}>
            <Text style={styles.jumpTodayText}>↩ Jump to today · Day {todayIdx + 1}</Text>
          </TouchableOpacity>
        )}

        {/* Day Navigation — during an active trip, today is dotted and past days dimmed */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayNav} contentContainerStyle={{ paddingHorizontal: spacing.xxl }}>
          {trip.days.map((d, i) => {
            const dc = calcDayCostForTrip(d, trip);
            const isToday = i === todayIdx;
            const isPast  = phase === 'active' && i < todayIdx;
            return (
              <TouchableOpacity
                key={d.date}
                style={[styles.dayBtn, i === currentDay && styles.dayBtnActive, isPast && styles.dayBtnPast]}
                onPress={() => setCurrentDay(i)}
              >
                <Text style={[styles.dayBtnLabel, i === currentDay && styles.dayBtnLabelActive]}>{d.label}</Text>
                <Text style={[styles.dayBtnDate, i === currentDay && { color: colors.primary }]}>{fmt(d.date)}</Text>
                {dc > 0 && <Text style={styles.dayCost}>{fmtM(dc)}</Text>}
                {isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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

        {/* Day Header */}
        {day && (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{day.label} — {fmt(day.date)}</Text>
            <View style={styles.dayHeaderActions}>
              {!!dayRouteUrl && (
                <TouchableOpacity style={styles.routeBtn} onPress={openDayRoute} activeOpacity={0.85}>
                  <Icon name="map" size={13} color={colors.accent} />
                  <Text style={styles.routeBtnText}>Route</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.arrangeBtn} onPress={planMyDay} activeOpacity={0.85}>
                <Icon name="sparkles" size={13} color={colors.smart} />
                <Text style={styles.arrangeBtnText}>Plan my day</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addActBtn} onPress={openAdd}>
                <Icon name="create-outline" size={13} color="#fff" />
                <Text style={styles.addActBtnText}>Manual</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Live "Today" orientation — now / next, only while the trip is happening */}
        {isToday && day && (() => {
          const { now, next, empty } = nowNextOf(day, nowMin);
          let text;
          if (empty) text = 'Nothing planned for today yet — add a stop or just wing it.';
          else if (next && now) text = `Now: ${now.name}  ·  Next: ${next.name} at ${next.time}`;
          else if (next) text = `Up next: ${next.name} at ${next.time}`;
          else text = `That's today's plan done — log any spend so tonight's split stays live.`;
          return (
            <View style={styles.todayBanner} accessibilityRole="text" accessibilityLabel={`Today. ${text}`}>
              <Text style={styles.todayBannerText} numberOfLines={2}>🟢 {text}</Text>
            </View>
          );
        })()}

        {/* Inline Trip Check for THIS day — ONE calm summary pill (positive-first),
            not a wall of red chips. Tap to open the full checker. */}
        {day && day.activities.length > 0 && (() => {
          const nErr  = dayWarnings.filter(w => w.severity === 'error').length;
          const nWarn = dayWarnings.filter(w => w.severity === 'warning').length;
          const nTip  = dayWarnings.filter(w => w.severity === 'info').length;
          const tipWord = n => `${n} tip${n !== 1 ? 's' : ''}`;
          let tone, label;
          if (nErr > 0) {
            const rest = nWarn + nTip;
            tone = 'fix';  label = `${nErr} to fix${rest ? ` · ${tipWord(rest)}` : ''}`;
          } else if (nWarn > 0) {
            tone = 'check'; label = `${nWarn} to check${nTip ? ` · ${tipWord(nTip)}` : ''}`;
          } else if (nTip > 0) {
            tone = 'tip';  label = `${tipWord(nTip)} for this day`;
          } else {
            tone = 'ok';   label = 'Looks well-paced';
          }
          const pal = DAY_PILL[tone];
          return (
            <TouchableOpacity
              style={[styles.dayPill, { backgroundColor: pal.bg }]}
              onPress={onCheckTrip}
              activeOpacity={tone === 'ok' ? 1 : 0.8}
              disabled={tone === 'ok'}
              accessibilityRole={tone === 'ok' ? 'text' : 'button'}
              accessibilityLabel={`This day: ${label}.${tone === 'ok' ? '' : ' Tap to review.'}`}
            >
              <Icon name={pal.icon} size={14} color={pal.fg} />
              <Text style={[styles.dayPillText, { color: pal.fg }]} numberOfLines={1}>{label}</Text>
              {tone !== 'ok' && <Icon name="forward" size={13} color={pal.fg} />}
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

        {/* Reorder hint — shown briefly after ↑↓ tap */}
        {reorderHint && (
          <View style={styles.reorderHintBar}>
            <Text style={styles.reorderHintText}>
              ↕ Order changed — use Check Trip in the header to verify the schedule
            </Text>
          </View>
        )}

        {/* Day template — Morning / Afternoon / Evening / Night */}
        <View style={styles.activities}>
          {!day ? null : day.activities.length === 0 ? (
            // Completely empty day — show AI/manual prompts then slot template
            <View>
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No activities planned yet</Text>
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
                  {renderHotelMealChip(slot.key)}
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
            // Has activities — group by slot
            // Find the index of the last slot that has activities (trailing empties collapse)
            (() => {
              const slotActsMap = DAY_SLOTS.map(slot => ({
                slot,
                acts: [...day.activities]
                  .filter(a => getSlotKey(a.time) === slot.key)
                  .sort((a, b) => (a.time || '').localeCompare(b.time || '')),
              }));
              const lastFilledIdx = slotActsMap.reduce((best, { acts }, i) => acts.length > 0 ? i : best, -1);
              return slotActsMap.map(({ slot, acts }, slotIdx) => {
              const slotActs     = acts;
              const doneCount    = slotActs.filter(a => a.status === 'done').length;
              const skippedCount = slotActs.filter(a => a.status === 'skipped').length;
              // Last stop of the nearest earlier section — for the cross-section travel leg.
              let prevSlotLast = null;
              for (let k = slotIdx - 1; k >= 0; k--) {
                if (slotActsMap[k].acts.length) { prevSlotLast = slotActsMap[k].acts[slotActsMap[k].acts.length - 1]; break; }
              }
              // Trailing empty slot — render compact add button instead of full card
              if (slotActs.length === 0 && slotIdx > lastFilledIdx) {
                return (
                  <TouchableOpacity
                    key={slot.key}
                    style={styles.slotCompact}
                    onPress={() => openAddInSlot(slot.defaultTime)}
                    activeOpacity={0.6}
                  >
                    <Icon name={slot.icon} size={14} color={slot.tint} />
                    <Text style={styles.slotCompactText}>Add {slot.label}</Text>
                    <Icon name="add" size={14} color={colors.subtle} />
                  </TouchableOpacity>
                );
              }

              const isCollapsed = !!collapsedSlots[slot.key];
              return (
                <View key={slot.key} style={styles.slotSection}>
                  {/* Slot header — tap to collapse/expand */}
                  <TouchableOpacity
                    style={styles.slotHeader}
                    onPress={() => toggleSlot(slot.key)}
                    activeOpacity={0.7}
                  >
                    {/* Row 1: emoji · label · [+ Add pill] · chevron */}
                    <View style={styles.slotHeaderRow}>
                      <Icon name={slot.icon} size={17} color={slot.tint} style={{ marginRight: spacing.xs }} />
                      <Text style={styles.slotLabel}>{slot.label}</Text>
                      {!isCollapsed && (
                        <TouchableOpacity
                          style={styles.slotAddBtn}
                          onPress={() => openAddInSlot(slot.defaultTime)}
                          hitSlop={{ top: 10, bottom: 10, left: 8, right: 4 }}
                        >
                          <Text style={styles.slotAddBtnText}>+ Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Row 2: muted meta — time hint · item count · status badges */}
                    <View style={styles.slotMetaRow}>
                      {isCollapsed ? (
                        <>
                          <Text style={styles.slotMetaText}>
                            {slotActs.length} item{slotActs.length !== 1 ? 's' : ''}
                          </Text>
                          {doneCount > 0    && <Text style={styles.slotDoneText}>  ✅ {doneCount} done</Text>}
                          {skippedCount > 0 && <Text style={styles.slotSkipText}>  ↩️ {skippedCount} skipped</Text>}
                        </>
                      ) : (
                        <>
                          <Text style={styles.slotMetaText}>{slot.hint}</Text>
                          {slotActs.length > 0 && (
                            <Text style={styles.slotMetaText}>
                              {'  ·  '}{slotActs.length} item{slotActs.length !== 1 ? 's' : ''}
                            </Text>
                          )}
                          {doneCount > 0    && <Text style={styles.slotDoneText}>  ✅ {doneCount}</Text>}
                          {skippedCount > 0 && <Text style={styles.slotSkipText}>  ↩️ {skippedCount}</Text>}
                        </>
                      )}
                    </View>
                  </TouchableOpacity>

                  {/* First stop of the day: travel leg from where you WOKE — origin on
                      Day 1, last night's hotel / friends-camping address otherwise. */}
                  {!isCollapsed && slotActs.length > 0 && !prevSlotLast && startAnchor?.lat != null && (
                    <OriginConnector origin={startAnchor} to={slotActs[0]} />
                  )}
                  {/* Woke somewhere we can't map (friends/camping, no address) → an honest,
                      self-explaining invite instead of a silently dropped first leg. */}
                  {!isCollapsed && slotActs.length > 0 && !prevSlotLast && priorNightNeedsAddr && (
                    <TouchableOpacity style={styles.wakeAskRow} onPress={() => openNightPlan(currentDay - 1)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityLabel="Morning starts at your first stop. Add where you stayed last night to map the drive.">
                      <Text style={styles.wakeAskText}>🌅 Morning starts at your first stop · <Text style={styles.wakeAskLink}>add where you stayed ›</Text></Text>
                    </TouchableOpacity>
                  )}

                  {/* Travel from the previous section's last stop into this one */}
                  {!isCollapsed && slotActs.length > 0 && prevSlotLast && (
                    <TravelConnector from={prevSlotLast} to={slotActs[0]} />
                  )}

                  {/* In-room dining — breakfast/lunch/dinner at the hotel for this slot */}
                  {!isCollapsed && renderHotelMealChip(slot.key)}

                  {!isCollapsed && slotActs.length === 0 ? (
                    <TouchableOpacity
                      style={styles.slotEmpty}
                      onPress={() => openAddInSlot(slot.defaultTime)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.slotEmptyText}>Nothing planned for {slot.label.toLowerCase()} · tap to add</Text>
                    </TouchableOpacity>
                  ) : !isCollapsed ? (
                    <FlatList
                      data={slotActs}
                      keyExtractor={(act) => act.id}
                      scrollEnabled={false}
                      renderItem={({ item: act, index }) => (
                        <>
                        {index > 0 && <TravelConnector from={slotActs[index - 1]} to={act} />}
                        <ActivityCard
                          activity={act}
                          trip={trip}
                          dayDate={day.date}
                          isHighlighted={highlightedActIds.includes(act.id)}
                          isFirst={index === 0}
                          isLast={index === slotActs.length - 1}
                          onMoveUp={() => {
                            if (index === 0) return;
                            const newOrder = [...slotActs];
                            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                            reorderSlotActivities(trip.id, currentDay, newOrder.map(a => a.id));
                          }}
                          onMoveDown={() => {
                            if (index === slotActs.length - 1) return;
                            const newOrder = [...slotActs];
                            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                            reorderSlotActivities(trip.id, currentDay, newOrder.map(a => a.id));
                          }}
                          onMarkDone={() => setDone(act)}
                          onMarkSkipped={() => setSkipped(act)}
                          onEdit={() => openEdit(act)}
                          onDelete={() => deleteWithUndo(act)}
                          onMoveRequest={() => setMovingAct(act)}
                          onSlotMove={() => openSlotMove(act)}
                          onExploreNearby={() => exploreNearby(act)}
                        />
                        </>
                      )}
                    />
                  ) : null}
                </View>
              );
            });
            })()
          )}

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
              return (
                <View style={styles.lodgeChip}>
                  <Icon name="hotel" size={14} color={colors.smart} />
                  <Text style={styles.lodgeChipText}>Night {lod.nightNumber} of {lod.nights} · {lod.stay.name}</Text>
                  {!lod.isCheckInDay && <Text style={styles.lodgeChipMuted}>· no extra charge</Text>}
                </View>
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
        onPress={() => { setDiscoverNear(null); setDiscoverSlot(null); setShowDiscover(true); }}
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
                <Text style={styles.npTitle}>How's tonight handled?</Text>
                <Text style={styles.npSubtitle}>Just so we know you've got it sorted — we won't ask again.</Text>
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
                    <Text style={styles.npAddrHint}>Optional — helps us map tomorrow's first drive. Skip anytime.</Text>
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
        onClose={() => { setShowDiscover(false); setDiscoverNear(null); setDiscoverSlot(null); }}
        trip={trip}
        dayIndex={currentDay}
        defaultTime={defaultSlotTime}
        defaultSlot={discoverSlot}
        nearby={discoverNear}
        onAddManual={(arg) => {
          // arg is a search string (the "add manually" bridge) OR a {lat,lng}
          // object (a pin dropped on the map → seed Stay with that location).
          setShowDiscover(false); setDiscoverNear(null); setDiscoverSlot(null);
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
            <Text style={styles.dayPickerTitle}>Move "{movingAct?.name}" to…</Text>
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
                        moveActivity(trip.id, currentDay, i, movingAct.id);
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

function ActivityCard({ activity: act, trip, dayDate, isHighlighted, isFirst, isLast, onMoveUp, onMoveDown, onMarkDone, onMarkSkipped, onEdit, onDelete, onMoveRequest, onSlotMove, onExploreNearby }) {
  const status    = act.status ?? null;
  const isDone    = status === 'done';
  const isSkipped = status === 'skipped';
  const dimmed    = isDone || isSkipped;
  const dietWarn  = getDietaryWarning(act, trip.families || []);
  const duration  = estimateDuration(act);

  // Hours of operation (attractions + restaurants) for this day. Closed-at-time
  // turns the badge red — the same call Trip Check's closed_venue rule makes.
  const showsHours  = act.type === 'activity' || act.type === 'food';
  const hoursWd     = showsHours ? weekdayOf(dayDate) : null;
  const hoursStr    = showsHours ? hoursLabel(act.openHours, hoursWd) : '';
  const openAtTime  = showsHours && act.time ? isOpenAt(act.openHours, hoursWd, toMin(act.time)) : null;
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
  const actIcon        = getActivityIcon(act.type, act.subtype);
  const isPerFamily    = act.costMode === 'per_family';
  const isTotal        = act.costMode === 'total';
  const displayCostAmt = isPerFamily || isTotal ? act.costAmount : act.costPerPerson;
  const displayCostLbl = isPerFamily ? '/fam' : isTotal ? ' total' : '/p';

  // ── Swipe-to-action: horizontal ScrollView (no PanResponder conflict) ──
  const swipeScrollRef = useRef(null);
  const close = () => swipeScrollRef.current?.scrollTo({ x: 0, animated: true });

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
        {/* ── Leading thumbnail: place photo · tinted type icon · status ── */}
        <View style={styles.actLead}>
          {dimmed ? (
            <Icon name={isDone ? 'checkmark-circle' : 'close-circle'} size={30} color={isDone ? colors.success : colors.danger} />
          ) : act.photo ? (
            <Image source={{ uri: act.photo }} style={styles.actLeadPhoto} />
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
            onLongPress={onSlotMove}
            delayLongPress={400}
            activeOpacity={1}
          >
            {/* Eyebrow — time · duration (transport shows arrival), quiet metadata */}
            {!dimmed && (
              <Text style={styles.actEyebrow} numberOfLines={1}>
                <Text style={styles.actEyebrowTime}>{act.time}</Text>
                {act.type === 'transport' && !!act.arriveTime ? ` → ${act.arriveTime}` : ''}
                {durationLabel ? `  ·  ~${durationLabel}` : ''}
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
                  <View style={[styles.costBadge, isPerFamily && { backgroundColor: '#f0eeff', borderColor: '#c4b5fd' }, isTotal && { backgroundColor: '#dcfce7', borderColor: '#a7f3d0' }]}>
                    <Text style={[styles.costBadgeText, isPerFamily && { color: '#7c3aed' }, isTotal && { color: '#065f46' }]}>
                      ~${displayCostAmt}{displayCostLbl}
                    </Text>
                  </View>
                )}
                {!!hoursStr && (
                  <View style={[styles.hoursBadge, openAtTime === false && styles.hoursBadgeClosed]}>
                    <Text style={[styles.hoursBadgeText, openAtTime === false && styles.hoursBadgeClosedText]}>
                      {openAtTime === false ? '🔴' : '🕒'} {hoursStr}
                    </Text>
                  </View>
                )}
                {!!dietWarn && (
                  <View style={styles.dietWarnBadge}>
                    <Text style={styles.dietWarnBadgeText}>{dietWarn}</Text>
                  </View>
                )}
                {!!act.access && (
                  <View style={[styles.costBadge, { backgroundColor: colors.greenLight, borderColor: '#b2dfdb' }]}>
                    <Text style={[styles.costBadgeText, { color: colors.green }]}>* {act.access}</Text>
                  </View>
                )}
              </View>
            )}

            {hasSecondary && !isSkipped && (
              <TouchableOpacity style={styles.cardFoldBtn} onPress={() => setCardExpanded(e => !e)}
                activeOpacity={0.6} onLongPress={onSlotMove} delayLongPress={400}>
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
                        💰 ${act.costAmount} shared — each family's share:
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

          {/* Bottom action row — edit & move only; delete is via swipe */}
          <View style={styles.actInlineActions}>
            <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <Icon name="create-outline" size={16} color={colors.subtle} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onMoveRequest} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <Icon name="calendar-outline" size={15} color={colors.subtle} />
            </TouchableOpacity>
            <Text style={styles.swipeHintText}>← swipe</Text>
          </View>
        </View>

        {/* ── Reorder buttons (right side) ── */}
        <View style={styles.reorderCol}>
          <TouchableOpacity onPress={onMoveUp} disabled={isFirst}
            hitSlop={{ top: 6, bottom: 4, left: 6, right: 6 }} activeOpacity={0.5}
            style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]}>
            <Text style={styles.reorderBtnText}>▲</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onMoveDown} disabled={isLast}
            hitSlop={{ top: 4, bottom: 6, left: 6, right: 6 }} activeOpacity={0.5}
            style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]}>
            <Text style={styles.reorderBtnText}>▼</Text>
          </TouchableOpacity>
        </View>
        </View>{/* end actCard */}

        {/* ── Action buttons (revealed when card scrolls left) ── */}
        <View style={styles.actCardActions}>
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#22c55e' }]}
            onPress={() => { close(); onMarkDone(); }}
          >
            <Icon name="checkmark" size={20} color="#fff" />
            <Text style={styles.actCardActionLabel}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#f97316' }]}
            onPress={() => { close(); onMarkSkipped(); }}
          >
            <Icon name="close" size={20} color="#fff" />
            <Text style={styles.actCardActionLabel}>Did Not Do</Text>
          </TouchableOpacity>
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
  miniTripAmt: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  miniSep: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  miniDayAmt: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  miniPP: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.green,
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
  dayBtnPast: { opacity: 0.45 },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#15803d', marginTop: 3 },
  dayNav: { marginTop: spacing.xl },
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
  dayBtnDate: { ...typography.caption, color: colors.muted, fontSize: 10, marginTop: 1 },
  dayCost: { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 10, marginTop: 1 },

  // ── Day header ───────────────────────────────────────────────────
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  dayTitle: { ...typography.h4, color: colors.text, flex: 1, marginRight: spacing.sm },
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
  arrangeBtnText: { ...typography.caption, color: colors.smartDeep, fontWeight: '800' },
  routeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accentSoft, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  routeBtnText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
  bfastChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffaf2', borderWidth: 1, borderColor: '#f0d9b5', borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm, marginTop: 2 },
  bfastChipText: { flex: 1, fontSize: 12.5, color: '#9a6b1e', fontWeight: '600' },
  bfastChipAdd: { fontSize: 11, color: colors.primary, fontWeight: '800' },
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
  emptyText: { ...typography.body, color: colors.muted, marginBottom: spacing.lg },
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
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
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
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
  actEyebrow:    { ...typography.caption, color: colors.subtle, marginBottom: 1 },
  actEyebrowTime:{ color: colors.primary, fontWeight: '800' },
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
    borderColor: '#f0c9b5',
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
  hoursBadgeClosed: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  hoursBadgeClosedText: { color: '#dc2626', fontWeight: '800' },
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
