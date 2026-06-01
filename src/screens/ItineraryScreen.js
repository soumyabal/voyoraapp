import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Alert, Linking, Modal, FlatList } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { fmt, fmtM, getActivityIcon } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost } from '../utils/costs';

const SCREEN_W = Dimensions.get('window').width;

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

export default function ItineraryScreen({ trip, switchTab, onPlanWithAI }) {
  const { currentDay, setCurrentDay, deleteActivity, pushItineraryToSplitwise, markActivityStatus, moveActivity } = useStore();
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editActivity,    setEditActivity]    = useState(null);
  const [defaultSlotTime, setDefaultSlotTime] = useState('09:00');
  const [movingAct,       setMovingAct]       = useState(null); // activity pending a day move

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
            <TouchableOpacity style={styles.addActBtn} onPress={openAdd}>
              <Text style={styles.addActBtnText}>+ Activity</Text>
            </TouchableOpacity>
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

              return (
                <View key={slot.key} style={styles.slotSection}>
                  {/* Slot header */}
                  <View style={styles.slotHeader}>
                    <Text style={styles.slotEmoji}>{slot.emoji}</Text>
                    <Text style={styles.slotLabel}>{slot.label}</Text>
                    <Text style={styles.slotHint}>{slot.hint}</Text>
                    {slotActs.length > 0 && (doneCount > 0 || skippedCount > 0) && (
                      <View style={styles.slotProgress}>
                        {doneCount > 0    && <Text style={styles.slotDoneText}>✅ {doneCount}</Text>}
                        {skippedCount > 0 && <Text style={styles.slotSkipText}>↩️ {skippedCount}</Text>}
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.slotAddBtn}
                      onPress={() => openAddInSlot(slot.defaultTime)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.slotAddBtnText}>+ Add</Text>
                    </TouchableOpacity>
                  </View>

                  {slotActs.length === 0 ? (
                    <TouchableOpacity
                      style={styles.slotEmpty}
                      onPress={() => openAddInSlot(slot.defaultTime)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.slotEmptyText}>Nothing planned for {slot.label.toLowerCase()} · tap to add</Text>
                    </TouchableOpacity>
                  ) : (
                    slotActs.map(act => (
                      <ActivityCard
                        key={act.id}
                        activity={act}
                        trip={trip}
                        onEdit={() => openEdit(act)}
                        onDelete={() => confirmDelete(act)}
                        onToggleStatus={() => cycleStatus(act)}
                        onMoveRequest={() => setMovingAct(act)}
                      />
                    ))
                  )}
                </View>
              );
            });
            })()
          )}
        </View>
      </ScrollView>

      <AddActivityModal
        visible={showAddActivity}
        trip={trip}
        currentDay={currentDay}
        editActivity={editActivity}
        defaultTime={defaultSlotTime}
        onClose={closeModal}
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

function ActivityCard({ activity: act, trip, onEdit, onDelete, onToggleStatus, onMoveRequest }) {
  const status   = act.status ?? null;   // null | 'done' | 'skipped'
  const isDone   = status === 'done';
  const isSkipped= status === 'skipped';
  const dimmed   = isDone || isSkipped;

  // Secondary content is collapsed by default; auto-expand if content exists on first render
  const hasSecondary = !!(act.detail || act.memo || act.reminder || act.note || act.address || act.url);
  const [cardExpanded, setCardExpanded] = useState(false);

  const famChips = act.costPerPerson > 0 ? trip.families.map(fam => ({
    ...fam, cost: fam.members.length * act.costPerPerson,
  })) : [];

  const isNote = act.type === 'note';
  const handleMapPress  = () => { if (act.mapUrl) Linking.openURL(act.mapUrl); };
  const handleUrlPress  = () => { if (act.url)    Linking.openURL(act.url); };
  const actIcon         = getActivityIcon(act.type, act.subtype);
  const isPerFamily = act.costMode === 'per_family';
  const isTotal     = act.costMode === 'total';
  // Badge shows the amount the user actually typed, not the derived costPerPerson
  const displayCostAmt = isPerFamily || isTotal ? act.costAmount : act.costPerPerson;
  const displayCostLbl = isPerFamily ? '/fam' : isTotal ? ' total' : '/p';

  return (
    <View style={[
      styles.actCard,
      { borderLeftColor: activityColors[act.type] || colors.muted },
      isNote    && styles.actCardNote,
      isDone    && styles.actCardDone,
      isSkipped && styles.actCardSkipped,
    ]}>
      {/* ── Checkbox ── */}
      <TouchableOpacity
        style={styles.checkboxCol}
        onPress={onToggleStatus}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <View style={[
          styles.checkbox,
          isDone    && styles.checkboxDone,
          isSkipped && styles.checkboxSkipped,
        ]}>
          {isDone    && <Text style={styles.checkMark}>✓</Text>}
          {isSkipped && <Text style={styles.checkMark}>✗</Text>}
        </View>
      </TouchableOpacity>

      {/* ── Time + icon ── */}
      <View style={[styles.actTimeCol, dimmed && { opacity: 0.45 }]}>
        <Text style={styles.actTime}>{act.time}</Text>
        <Text style={styles.actIcon}>{actIcon}</Text>
      </View>

      {/* ── Body ── */}
      <View style={[styles.actBody, dimmed && { opacity: dimmed ? 0.55 : 1 }]}>
        {/* Status badge */}
        {isDone    && <View style={styles.statusBadgeDone}><Text style={styles.statusBadgeText}>✅ Done</Text></View>}
        {isSkipped && <View style={styles.statusBadgeSkip}><Text style={[styles.statusBadgeText, { color: '#6b7280' }]}>↩️ Skipped</Text></View>}

        <View style={styles.actNameRow}>
          <Text style={[
            styles.actName,
            isNote    && styles.actNameNote,
            isSkipped && styles.actNameSkipped,
            isDone    && { color: colors.green },
          ]} numberOfLines={2}>{act.name}</Text>
          {!!act.rating && !dimmed && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>⭐ {act.rating}</Text>
            </View>
          )}
        </View>

        {/* Always-visible: cost badge */}
        {!dimmed && displayCostAmt > 0 && (
          <View style={styles.actTags}>
            <View style={[styles.costBadge, isPerFamily && { backgroundColor: '#f0eeff', borderColor: '#c4b5fd' }, isTotal && { backgroundColor: '#dcfce7', borderColor: '#a7f3d0' }]}>
              <Text style={[styles.costBadgeText, isPerFamily && { color: '#7c3aed' }, isTotal && { color: '#065f46' }]}>
                ~${displayCostAmt}{displayCostLbl}
              </Text>
            </View>
            {!!act.access && (
              <View style={[styles.costBadge, { backgroundColor: colors.greenLight, borderColor: '#b2dfdb' }]}>
                <Text style={[styles.costBadgeText, { color: colors.green }]}>♿ {act.access}</Text>
              </View>
            )}
          </View>
        )}

        {/* Fold toggle — only shown when secondary content exists */}
        {hasSecondary && !isSkipped && (
          <TouchableOpacity
            style={styles.cardFoldBtn}
            onPress={() => setCardExpanded(e => !e)}
            activeOpacity={0.6}
          >
            <Text style={styles.cardFoldText}>{cardExpanded ? '▴ less' : '▾ details'}</Text>
          </TouchableOpacity>
        )}

        {/* Secondary content — shown when expanded */}
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
      </View>

      {/* ── Edit / Move / Delete ── */}
      <View style={styles.actActions}>
        <TouchableOpacity style={styles.actActionBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.editBtnText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actActionBtn} onPress={onMoveRequest} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.moveBtnText}>📅</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actActionBtn} onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.delBtnText}>🗑</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  dayTitle: { ...typography.h4, color: colors.text },
  addActBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  addActBtnText: { ...typography.caption, color: '#fff', fontWeight: '800' },

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
  slotSection: { marginBottom: spacing.lg },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  slotEmoji:       { fontSize: 15 },
  slotLabel:       { ...typography.bodyBold, color: colors.text, fontSize: 13 },
  slotHint:        { ...typography.caption, color: colors.muted, fontSize: 11, flex: 1 },
  slotProgress:    { flexDirection: 'row', gap: spacing.xs },
  slotDoneText:    { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 11 },
  slotSkipText:    { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 11 },
  slotAddBtn:      { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  slotAddBtnText:  { ...typography.caption, color: colors.primary, fontWeight: '800', fontSize: 11 },
  slotCompact: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.sm,
  },
  slotCompactText: { ...typography.caption, color: colors.muted, fontSize: 12 },

  slotEmpty: {
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  slotEmptyText: { ...typography.caption, color: colors.muted, fontSize: 12 },

  // Empty day slot template (full empty day)
  emptySlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.xxl,
    marginBottom: spacing.sm,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    ...shadow.sm,
  },
  emptySlotEmoji: { fontSize: 22 },
  emptySlotLabel: { ...typography.bodyBold, color: colors.muted, fontSize: 13 },
  emptySlotHint:  { ...typography.caption, color: '#c0c8d0', fontSize: 11, marginTop: 1 },
  emptySlotPlus:  { fontSize: 22, color: colors.primary, fontWeight: '300' },

  // ── Activity card ────────────────────────────────────────────────
  actCard: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xxl,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow.sm,
  },
  actCardNote:    { backgroundColor: '#f9fafb' },
  actCardDone:    { backgroundColor: '#f0fdf4', borderLeftColor: colors.green },
  actCardSkipped: { backgroundColor: '#f9fafb', opacity: 0.75 },

  // Checkbox
  checkboxCol: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkboxDone:    { backgroundColor: colors.green, borderColor: colors.green },
  checkboxSkipped: { backgroundColor: '#9ca3af',    borderColor: '#9ca3af' },
  checkMark:       { fontSize: 13, color: '#fff', fontWeight: '800', lineHeight: 16 },

  // Status badges
  statusBadgeDone: { backgroundColor: '#dcfce7', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  statusBadgeSkip: { backgroundColor: '#f3f4f6', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4 },
  statusBadgeText: { ...typography.caption, fontSize: 10, fontWeight: '700', color: colors.green },
  actNameSkipped:  { textDecorationLine: 'line-through', color: colors.muted },

  actTimeCol: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  actTime: { ...typography.caption, color: colors.muted, fontWeight: '700', fontSize: 11 },
  actIcon: { fontSize: 16, marginTop: spacing.xs },
  actBody: { flex: 1, padding: spacing.md },
  actNameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 },
  actName: { ...typography.bodyBold, color: colors.text, flex: 1 },
  actNameNote: { color: colors.muted, fontWeight: '500' },
  ratingBadge: {
    backgroundColor: '#fff3e0',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#ffe0b2',
    marginLeft: spacing.sm,
    flexShrink: 0,
  },
  ratingText: { fontSize: 10, fontWeight: '700', color: '#e65100' },
  cardFoldBtn:  { paddingTop: 4, paddingBottom: 2 },
  cardFoldText: { fontSize: 10, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 },
  actDetail:    { ...typography.caption, color: colors.muted, marginBottom: spacing.sm },
  memoRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 },
  memoIcon:     { fontSize: 11, marginTop: 1 },
  memoText:     { ...typography.caption, color: colors.muted, flex: 1, fontSize: 11, lineHeight: 16 },
  reminderRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 3 },
  reminderIcon: { fontSize: 11, marginTop: 1 },
  reminderText: { ...typography.caption, color: '#f97316', flex: 1, fontSize: 11, fontWeight: '600', lineHeight: 16 },
  aiTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0faf8',
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: 5,
    borderWidth: 1,
    borderColor: '#b2dfdb',
  },
  aiTipIcon: { fontSize: 11, marginTop: 1 },
  aiTipText: { ...typography.caption, color: '#00796b', flex: 1, lineHeight: 16, fontSize: 11 },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 2,
  },
  locationIcon: { fontSize: 11 },
  locationText: { ...typography.caption, color: colors.primary, flex: 1, fontSize: 11, textDecorationLine: 'underline' },
  locationArrow: { ...typography.caption, color: colors.muted, fontSize: 14, fontWeight: '700' },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  urlIcon: { fontSize: 11 },
  urlText: { ...typography.caption, color: colors.primary, flex: 1, fontSize: 11, textDecorationLine: 'underline' },
  actTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.xs },
  costBadge: {
    backgroundColor: colors.yellowLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#f0d080',
  },
  costBadgeText: { ...typography.caption, color: '#9b6e00', fontWeight: '700', fontSize: 11 },
  famChipsTotalHint: { fontSize: 10, color: colors.muted, fontStyle: 'italic', marginBottom: 3 },
  famChips: { flexDirection: 'row', marginTop: 2 },
  famChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginRight: spacing.xs,
  },
  famChipDot: { width: 6, height: 6, borderRadius: 3, marginRight: 3 },
  famChipText: { ...typography.caption, color: colors.muted, fontSize: 10 },

  // ── Edit / Delete actions ────────────────────────────────────────
  actActions: {
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  actActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actActionBtnDisabled: { opacity: 0.3 },
  editBtnText: { fontSize: 14 },
  moveBtnText: { fontSize: 14 },
  delBtnText:  { fontSize: 14 },

  // Day picker modal
  dayPickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  dayPickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingBottom: 36,
  },
  dayPickerHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 8,
  },
  dayPickerTitle: {
    fontSize: 13, fontWeight: '800', color: colors.text,
    paddingHorizontal: spacing.xxl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dayPickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  dayPickerRowCurrent: { backgroundColor: colors.surface2 },
  dayPickerLabel:       { ...typography.bodyBold, color: colors.text },
  dayPickerLabelCurrent:{ color: colors.muted },
  dayPickerDate:        { ...typography.caption, color: colors.muted, marginTop: 2 },
  dayPickerCurrent:     { fontSize: 11, color: colors.muted, fontStyle: 'italic' },
  dayPickerArrow:       { fontSize: 18, color: colors.primary, fontWeight: '700' },
});

// ── Chart + CollapsibleHeader styles ─────────────────────────────
const ch = StyleSheet.create({
  // ── Standalone chart (legacy path, unused now) ──
  wrap: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  // ── Compact chart: no own background/margin — sits inside CollapsibleHeader ──
  wrapCompact: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  label: { ...typography.caption, color: 'rgba(255,255,255,0.45)', fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  totalLine: { ...typography.bodyBold, color: '#fff', fontSize: 13, marginTop: 1 },
  emptyHint: { ...typography.caption, color: 'rgba(255,255,255,0.3)', fontSize: 10 },
  chartArea: { flexDirection: 'row', alignItems: 'flex-end' },
  barWrapper: { alignItems: 'center', justifyContent: 'flex-end' },
  bar: {},
  barLabel: { ...typography.caption, color: '#fff', fontSize: 9, fontWeight: '700', position: 'absolute', top: -14 },
  dayLabels: { flexDirection: 'row', marginTop: spacing.xs },
  dayLabelText: { ...typography.caption, color: 'rgba(255,255,255,0.3)', fontSize: 9, textAlign: 'center' },
  dayLabelActive: { color: colors.green, fontWeight: '700' },

  // ── Option D: Sticky bar ─────────────────────────────────────
  stickyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.text,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    gap: spacing.md,
    // shadow separates bar from scroll content
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 6,
  },
  miniTripLabel: {
    fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2,
  },
  miniTripAmt:  { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  miniSep:      { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.15)' },
  miniDayAmt:   { fontSize: 15, fontWeight: '800', color: '#fff' },
  miniPP:       { fontSize: 11, fontWeight: '600', color: colors.green },
  infoBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  infoBtnText: { fontSize: 16, color: 'rgba(255,255,255,0.6)' },

  // ── Detail sheet (Modal) ──────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: colors.text,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
  },
  sheetTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  sheetClose: { fontSize: 16, color: 'rgba(255,255,255,0.45)', fontWeight: '700' },
  sheetSummary: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  sheetTotalAmt: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  sheetTotalSub: { fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 },
  sheetDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: spacing.xl, marginVertical: spacing.sm },

  // Family row inside sheet
  famRow: { flexDirection: 'row', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.xl },
  famCol: { alignItems: 'center' },
  famName: { fontSize: 12, fontWeight: '800' },
  famAmt:  { fontSize: 12, color: '#fff', fontWeight: '700', marginTop: 2 },
  famSub:  { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 },

  // Push / synced inside sheet
  pushBtn: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  pushBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  syncedBadge: {
    marginHorizontal: spacing.xl, marginTop: spacing.md,
    backgroundColor: 'rgba(0,184,148,0.18)',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(0,184,148,0.35)',
  },
  syncedText: { fontSize: 12, color: colors.green, fontWeight: '700' },
});
