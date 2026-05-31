import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList, Dimensions, Alert, Linking } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { fmt, fmtM, getAllMembers } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost } from '../utils/costs';

const SCREEN_W = Dimensions.get('window').width;

// ── Robinhood-style expense chart ─────────────────────────────────
function TripExpenseChart({ trip, currentDay, onSelectDay }) {
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
    <View style={ch.wrap}>
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


export default function ItineraryScreen({ trip, switchTab, onPlanWithAI }) {
  const { currentDay, setCurrentDay, deleteActivity, pushItineraryToSplitwise } = useStore();
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [editActivity, setEditActivity] = useState(null);
  const day = trip.days[currentDay] || trip.days[0];
  const allMembers = getAllMembers(trip);
  const itinTotal = calcTripItineraryTotal(trip);
  const dayCost = day ? calcDayCostForTrip(day, trip) : 0;
  const dayPP = day ? calcDayPerPersonCost(day) : 0;

  const handlePush = () => {
    pushItineraryToSplitwise(trip.id);
    switchTab('splitwise');
  };

  const openEdit = (act) => { setEditActivity(act); setShowAddActivity(true); };
  const openAdd  = () => { setEditActivity(null); setShowAddActivity(true); };
  const closeModal = () => { setShowAddActivity(false); setEditActivity(null); };

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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Cost Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerTotal}>
            <Text style={styles.bannerLabel}>Total Trip Estimate</Text>
            <Text style={styles.bannerAmt}>{fmtM(itinTotal)}</Text>
            <Text style={styles.bannerSub}>{allMembers.length} travelers · {trip.days.length} days</Text>
          </View>
          <View style={styles.bannerDivider} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.famScroll}>
            {trip.families.map(fam => {
              const fc = calcFamilyItineraryCost(fam, trip);
              return (
                <View key={fam.id} style={styles.famCol}>
                  <Text style={[styles.famName, { color: fam.color }]}>{fam.name.split(' ')[0]}</Text>
                  <Text style={styles.famAmt}>{fmtM(fc)}</Text>
                  <Text style={styles.famSub}>{fam.members.length}p</Text>
                </View>
              );
            })}
          </ScrollView>
          {trip.itineraryPushed ? (
            <View style={styles.syncedBadge}>
              <Text style={styles.syncedBadgeText}>✅ Synced to Splitwise — edits update automatically</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.pushBtn} onPress={handlePush}>
              <Text style={styles.pushBtnText}>➡️ Move to Splitwise</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Expense Chart */}
        <TripExpenseChart trip={trip} currentDay={currentDay} onSelectDay={setCurrentDay} />

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

        {/* Day Cost Strip */}
        {dayCost > 0 && (
          <View style={styles.costStrip}>
            <View style={styles.stripItem}>
              <Text style={styles.stripLabel}>Day Total</Text>
              <Text style={[styles.stripVal, { color: colors.green }]}>{fmtM(dayCost)}</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripItem}>
              <Text style={styles.stripLabel}>Per Person</Text>
              <Text style={styles.stripVal}>{fmtM(dayPP)}</Text>
            </View>
            <View style={styles.stripDivider} />
            <View style={styles.stripItem}>
              <Text style={styles.stripLabel}>Activities</Text>
              <Text style={styles.stripVal}>{day?.activities.filter(a => a.costPerPerson > 0).length} costed</Text>
            </View>
          </View>
        )}

        {/* Per-family day pills */}
        {dayCost > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: spacing.xxl }}>
            <View style={styles.famPills}>
              {trip.families.map(fam => {
                const fc = fam.members.length * dayPP;
                return (
                  <View key={fam.id} style={styles.famPill}>
                    <View style={[styles.famDot, { backgroundColor: fam.color }]} />
                    <Text style={styles.famPillName}>{fam.name.split(' ')[0]}</Text>
                    <Text style={styles.famPillAmt}>{fmtM(fc)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {/* Activities */}
        <View style={styles.activities}>
          {!day || day.activities.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No activities planned yet</Text>
              {!!onPlanWithAI && (
                <TouchableOpacity style={styles.emptyAiBtn} onPress={onPlanWithAI} activeOpacity={0.85}>
                  <Text style={styles.emptyAiBtnText}>✨ Plan with AI</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                <Text style={styles.emptyBtnText}>+ Add Manually</Text>
              </TouchableOpacity>
            </View>
          ) : (
            [...day.activities].sort((a, b) => a.time.localeCompare(b.time)).map(act => (
              <ActivityCard
                key={act.id}
                activity={act}
                trip={trip}
                onEdit={() => openEdit(act)}
                onDelete={() => confirmDelete(act)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <AddActivityModal
        visible={showAddActivity}
        trip={trip}
        currentDay={currentDay}
        editActivity={editActivity}
        onClose={closeModal}
      />
    </View>
  );
}

function ActivityCard({ activity: act, trip, onEdit, onDelete }) {
  const famChips = act.costPerPerson > 0 ? trip.families.map(fam => ({
    ...fam, cost: fam.members.length * act.costPerPerson,
  })) : [];

  const isNote = act.type === 'note';

  const handleMapPress = () => { if (act.mapUrl) Linking.openURL(act.mapUrl); };
  const handleUrlPress = () => { if (act.url) Linking.openURL(act.url); };

  return (
    <View style={[styles.actCard, { borderLeftColor: activityColors[act.type] || colors.muted }, isNote && styles.actCardNote]}>
      <View style={styles.actTimeCol}>
        <Text style={styles.actTime}>{act.time}</Text>
        <Text style={styles.actIcon}>{activityIcons[act.type] || '📌'}</Text>
      </View>
      <View style={styles.actBody}>
        {/* Name + rating on same row */}
        <View style={styles.actNameRow}>
          <Text style={[styles.actName, isNote && styles.actNameNote]} numberOfLines={2}>{act.name}</Text>
          {!!act.rating && (
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingText}>⭐ {act.rating}</Text>
            </View>
          )}
        </View>

        {!!act.detail && <Text style={styles.actDetail}>{act.detail}</Text>}

        {/* AI Tip */}
        {!!act.note && !isNote && (
          <View style={styles.aiTipRow}>
            <Text style={styles.aiTipIcon}>💡</Text>
            <Text style={styles.aiTipText}>{act.note}</Text>
          </View>
        )}

        <View style={styles.actTags}>
          {act.costPerPerson > 0 && (
            <View style={styles.costBadge}><Text style={styles.costBadgeText}>~${act.costPerPerson}/person</Text></View>
          )}
          {!!act.access && (
            <View style={[styles.costBadge, { backgroundColor: colors.greenLight, borderColor: '#b2dfdb' }]}>
              <Text style={[styles.costBadgeText, { color: colors.green }]}>♿ {act.access}</Text>
            </View>
          )}
        </View>

        {/* Address → opens Google Maps */}
        {!!act.address && (
          <TouchableOpacity style={styles.locationRow} onPress={handleMapPress} activeOpacity={0.7}>
            <Text style={styles.locationIcon}>📍</Text>
            <Text style={styles.locationText} numberOfLines={1}>{act.address}</Text>
            {!!act.mapUrl && <Text style={styles.locationArrow}>›</Text>}
          </TouchableOpacity>
        )}

        {/* Website link */}
        {!!act.url && (
          <TouchableOpacity style={styles.urlRow} onPress={handleUrlPress} activeOpacity={0.7}>
            <Text style={styles.urlIcon}>🌐</Text>
            <Text style={styles.urlText} numberOfLines={1}>
              {act.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </Text>
            <Text style={styles.locationArrow}>›</Text>
          </TouchableOpacity>
        )}

        {famChips.length > 0 && (
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
        )}
      </View>
      <View style={styles.actActions}>
        <TouchableOpacity style={styles.actActionBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.editBtnText}>✏️</Text>
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
  activities: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm },
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

  // ── Activity card ────────────────────────────────────────────────
  actCard: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    marginBottom: spacing.md,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow.sm,
  },
  actCardNote: { backgroundColor: '#f9fafb' },
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
  actDetail: { ...typography.caption, color: colors.muted, marginBottom: spacing.sm },
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
  editBtnText: { fontSize: 14 },
  delBtnText: { fontSize: 14 },
});

// ── Chart styles ──────────────────────────────────────────────────
const ch = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.lg,
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
});
