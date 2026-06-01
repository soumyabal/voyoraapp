import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Dimensions, Alert, Linking, Modal } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import DiscoverModal from '../modals/DiscoverModal';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { fmt, fmtM, getActivityIcon } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost } from '../utils/costs';
import { validateTrip, summariseWarnings } from '../utils/tripValidator';

const SCREEN_W       = Dimensions.get('window').width;
const CARD_ACTIONS_W = 216;                        // 3 × 72px action buttons
const CARD_W         = SCREEN_W - 48;              // SCREEN_W - 2 × spacing.xxl (24)

// ── Day template: time slots ──────────────────────────────────────
const DAY_SLOTS = [
  { key: 'morning',   emoji: '🌅', label: 'Morning',   hint: 'Before noon',   defaultTime: '09:00', range: [0,   720]  },
  { key: 'afternoon', emoji: '☀️',  label: 'Afternoon', hint: '12 pm – 5 pm',  defaultTime: '13:00', range: [720, 1020] },
  { key: 'evening',   emoji: '🌆', label: 'Evening',   hint: '5 pm – 9 pm',   defaultTime: '18:00', range: [1020,1260] },
  { key: 'night',     emoji: '🌙', label: 'Night',     hint: 'After 9 pm',    defaultTime: '21:00', range: [1260,1440] },
];

function getSlotKey(timeStr) {
  if (!timeStr) return 'morning';
  const [h, m] = timeStr.split(':').map(Number);
  const mins = (h || 0) * 60 + (m || 0);
  if (mins < 720)  return 'morning';
  if (mins < 1020) return 'afternoon';
  if (mins < 1260) return 'evening';
  return 'night';
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
function StickyHeader({ trip, currentDay, onSelectDay, onPush }) {
  const [showDetail, setShowDetail] = useState(false);
  const itinTotal = calcTripItineraryTotal(trip);
  const day     = trip.days[currentDay];
  const dayCost = day ? calcDayCostForTrip(day, trip) : 0;
  const dayPP   = day ? calcDayPerPersonCost(day) : 0;

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

        {/* Detail trigger */}
        <TouchableOpacity style={ch.infoBtn} onPress={() => setShowDetail(true)} activeOpacity={0.7}>
          <Text style={ch.infoBtnText}>ⓘ</Text>
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
            {trip.itineraryPushed ? (
              <View style={ch.syncedBadge}>
                <Text style={ch.syncedText}>✅ Synced to Splitwise — edits update automatically</Text>
              </View>
            ) : (
              <TouchableOpacity style={ch.pushBtn} onPress={() => { onPush(); setShowDetail(false); }}>
                <Text style={ch.pushBtnText}>➡️ Move to Splitwise</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function ItineraryScreen({ trip, switchTab, onPlanWithAI, onCheckTrip, highlightedActIds = [] }) {
  const { currentDay, setCurrentDay, deleteActivity, updateActivity, pushItineraryToSplitwise, markActivityStatus, moveActivity, reorderActivity, reorderSlotActivities } = useStore();
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editActivity,    setEditActivity]    = useState(null);
  const [defaultSlotTime, setDefaultSlotTime] = useState('09:00');
  const [showDiscover,    setShowDiscover]    = useState(false);
  const [movingAct,       setMovingAct]       = useState(null);
  const [reorderHint,    setReorderHint]    = useState(false);
  const [collapsedSlots, setCollapsedSlots] = useState({});   // { [slotKey]: true }

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

  const handlePush = () => { pushItineraryToSplitwise(trip.id); switchTab('splitwise'); };

  const openEdit       = (act)  => { setEditActivity(act); setShowAddActivity(true); };
  const openAdd        = ()     => { setDefaultSlotTime('09:00'); setEditActivity(null); setShowAddActivity(true); };
  const openAddInSlot  = (time) => { setDefaultSlotTime(time);    setEditActivity(null); setShowAddActivity(true); };
  const closeModal     = ()     => { setShowAddActivity(false); setEditActivity(null); };

  const cycleStatus = (act) => {
    const next = !act.status ? 'done' : act.status === 'done' ? 'skipped' : null;
    markActivityStatus(trip.id, act.id, next);
  };
  // Direct-status setters for swipe actions (toggle off if already set)
  const setDone    = (act) => markActivityStatus(trip.id, act.id, act.status === 'done'    ? null : 'done');
  const setSkipped = (act) => markActivityStatus(trip.id, act.id, act.status === 'skipped' ? null : 'skipped');

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

  const confirmDelete = (act) => {
    Alert.alert(
      'Delete Activity',
      `Remove "${act.name}" from the itinerary?${trip.itineraryPushed && act.costPerPerson > 0 ? '\n\nThe linked Splitwise expense will also be removed.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteActivity(trip.id, act.id) },
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
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Day Navigation */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayNav} contentContainerStyle={{ paddingHorizontal: spacing.xxl }}>
          {trip.days.map((d, i) => {
            const dc = calcDayCostForTrip(d, trip);
            return (
              <TouchableOpacity
                key={d.date}
                style={[styles.dayBtn, i === currentDay && styles.dayBtnActive]}
                onPress={() => setCurrentDay(i)}
              >
                <Text style={[styles.dayBtnLabel, i === currentDay && styles.dayBtnLabelActive]}>{d.label}</Text>
                <Text style={[styles.dayBtnDate, i === currentDay && { color: colors.primary }]}>{fmt(d.date)}</Text>
                {dc > 0 && <Text style={styles.dayCost}>{fmtM(dc)}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Day Header */}
        {day && (
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{day.label} — {fmt(day.date)}</Text>
            <View style={styles.dayHeaderActions}>
              <TouchableOpacity style={styles.discoverBtn} onPress={() => setShowDiscover(true)}>
                <Text style={styles.discoverBtnText}>🔍 Discover</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addActBtn} onPress={openAdd}>
                <Text style={styles.addActBtnText}>+ Activity</Text>
              </TouchableOpacity>
            </View>
          </View>
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
                    <Text style={styles.emptyAiBtnText}>✨ Plan with AI</Text>
                  </TouchableOpacity>
                )}
              </View>
              {/* Empty slot template */}
              {DAY_SLOTS.map(slot => (
                <TouchableOpacity
                  key={slot.key}
                  style={styles.emptySlot}
                  onPress={() => openAddInSlot(slot.defaultTime)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.emptySlotEmoji}>{slot.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.emptySlotLabel}>{slot.label}</Text>
                    <Text style={styles.emptySlotHint}>{slot.hint} · tap to add</Text>
                  </View>
                  <Text style={styles.emptySlotPlus}>+</Text>
                </TouchableOpacity>
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
              // Trailing empty slot — render compact add button instead of full card
              if (slotActs.length === 0 && slotIdx > lastFilledIdx) {
                return (
                  <TouchableOpacity
                    key={slot.key}
                    style={styles.slotCompact}
                    onPress={() => openAddInSlot(slot.defaultTime)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.slotCompactText}>{slot.emoji} + Add {slot.label}</Text>
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
                      <Text style={styles.slotEmoji}>{slot.emoji}</Text>
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
                        <ActivityCard
                          activity={act}
                          trip={trip}
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
                          onDelete={() => confirmDelete(act)}
                          onMoveRequest={() => setMovingAct(act)}
                          onSlotMove={() => openSlotMove(act)}
                        />
                      )}
                    />
                  ) : null}
                </View>
              );
            });
            })()
          )}
        </View>
      </ScrollView>

      {/* ── Check Trip FAB ── */}
      {!!onCheckTrip && (() => {
        const issues = validateTrip(trip);
        const { errors, warnings, infos } = summariseWarnings(issues);
        // Ignored warnings don't count toward the badge
        const ignoredKeys = trip.ignoredWarnings || [];
        const visible = issues.filter(w => !ignoredKeys.includes(`${w.type}:${w.dayIndex ?? 'trip'}`));
        const total = visible.length;
        const visErrors   = visible.filter(w => w.severity === 'error').length;
        const visWarnings = visible.filter(w => w.severity === 'warning').length;
        const visInfos    = visible.filter(w => w.severity === 'info').length;
        // Color: red=conflicts, orange=warnings, blue=suggestions only, green=all clear
        const fabColor = visErrors   > 0 ? colors.red
                       : visWarnings > 0 ? '#d97706'
                       : visInfos    > 0 ? '#3b82f6'
                       : colors.green;
        const fabIcon  = visErrors   > 0 ? '🚫'
                       : visWarnings > 0 ? '⚠️'
                       : visInfos    > 0 ? '💡'
                       : '✅';
        return (
          <TouchableOpacity
            style={[styles.checkFab, { backgroundColor: fabColor }]}
            onPress={onCheckTrip}
            activeOpacity={0.85}
          >
            <Text style={styles.checkFabIcon}>{fabIcon}</Text>
            <Text style={styles.checkFabText}>Check Trip</Text>
            {total > 0 && (
              <View style={styles.checkFabBadge}>
                <Text style={styles.checkFabBadgeText}>{total}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })()}

      <AddActivityModal
        visible={showAddActivity}
        trip={trip}
        currentDay={currentDay}
        editActivity={editActivity}
        defaultTime={defaultSlotTime}
        onClose={closeModal}
      />

      <DiscoverModal
        visible={showDiscover}
        onClose={() => setShowDiscover(false)}
        trip={trip}
        dayIndex={currentDay}
        defaultTime={defaultSlotTime}
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

function ActivityCard({ activity: act, trip, isHighlighted, isFirst, isLast, onMoveUp, onMoveDown, onMarkDone, onMarkSkipped, onEdit, onDelete, onMoveRequest, onSlotMove }) {
  const status    = act.status ?? null;
  const isDone    = status === 'done';
  const isSkipped = status === 'skipped';
  const dimmed    = isDone || isSkipped;

  const hasSecondary = !!(act.detail || act.memo || act.reminder || act.note || act.address || act.url);
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
        {/* ── Time + icon (or big status emoji when done/skipped) ── */}
        <View style={styles.actTimeCol}>
          {dimmed ? (
            <Text style={styles.actStatusEmoji}>{isDone ? '✅' : '❌'}</Text>
          ) : (
            <>
              <Text style={styles.actTime}>{act.time}</Text>
              <Text style={styles.actIcon}>{actIcon}</Text>
            </>
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

            {!dimmed && displayCostAmt > 0 && (
              <View style={styles.actTags}>
                <View style={[styles.costBadge, isPerFamily && { backgroundColor: '#f0eeff', borderColor: '#c4b5fd' }, isTotal && { backgroundColor: '#dcfce7', borderColor: '#a7f3d0' }]}>
                  <Text style={[styles.costBadgeText, isPerFamily && { color: '#7c3aed' }, isTotal && { color: '#065f46' }]}>
                    ~${displayCostAmt}{displayCostLbl}
                  </Text>
                </View>
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
              <Text style={styles.editBtnText}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onMoveRequest} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.6}>
              <Text style={styles.moveBtnText}>📅</Text>
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
            <Text style={styles.actCardActionIcon}>✓</Text>
            <Text style={styles.actCardActionLabel}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#f97316' }]}
            onPress={() => { close(); onMarkSkipped(); }}
          >
            <Text style={styles.actCardActionIcon}>✗</Text>
            <Text style={styles.actCardActionLabel}>Did Not Do</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actCardAction, { backgroundColor: '#ef4444' }]}
            onPress={() => { close(); onDelete(); }}
          >
            <Text style={styles.actCardActionIcon}>🗑</Text>
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

  // ── Day navigation ───────────────────────────────────────────────
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
  discoverBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  discoverBtnText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  addActBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addActBtnText: { ...typography.caption, color: '#fff', fontWeight: '800' },

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
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { ...typography.body, color: colors.muted, marginBottom: spacing.lg },
  emptyAiBtn: {
    backgroundColor: colors.ai,
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
  reorderBtnText: {
    fontSize: 10,
    color: colors.textSecondary,
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
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  slotCompactText: { ...typography.caption, color: colors.muted },
  emptySlot: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptySlotEmoji: { fontSize: 24 },
  emptySlotLabel: { ...typography.bodyBold, color: colors.muted },
  emptySlotHint:  { ...typography.caption, color: colors.muted },
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

  // Time column
  actTimeCol:    { alignItems: 'center', justifyContent: 'center', minWidth: 44 },
  actTime:       { ...typography.caption, color: colors.primary, fontWeight: '700' },
  actIcon:       { fontSize: 18, marginTop: 3 },
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
    backgroundColor: '#e0faf4',
    borderWidth: 1,
    borderColor: '#a0e6d4',
  },
  costBadgeText: { fontSize: 11, fontWeight: '700', color: colors.green },
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
