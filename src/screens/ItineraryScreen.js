import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import useStore from '../store';
import AddActivityModal from '../modals/AddActivityModal';
import { colors, spacing, radius, typography, shadow, activityColors, activityIcons } from '../theme';
import { fmt, fmtM, getAllMembers } from '../utils/helpers';
import { calcTripItineraryTotal, calcDayCostForTrip, calcDayPerPersonCost, calcFamilyItineraryCost } from '../utils/costs';

export default function ItineraryScreen({ trip, switchTab }) {
  const { currentDay, setCurrentDay, deleteActivity, pushItineraryToSplitwise } = useStore();
  const [showAddActivity, setShowAddActivity] = useState(false);
  const day = trip.days[currentDay] || trip.days[0];
  const allMembers = getAllMembers(trip);
  const itinTotal = calcTripItineraryTotal(trip);
  const dayCost = day ? calcDayCostForTrip(day, trip) : 0;
  const dayPP = day ? calcDayPerPersonCost(day) : 0;

  const handlePush = () => {
    pushItineraryToSplitwise(trip.id);
    switchTab('splitwise');
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
          <TouchableOpacity style={styles.pushBtn} onPress={handlePush}>
            <Text style={styles.pushBtnText}>➡️ Move to Splitwise</Text>
          </TouchableOpacity>
        </View>

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
            <TouchableOpacity style={styles.addActBtn} onPress={() => setShowAddActivity(true)}>
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
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddActivity(true)}>
                <Text style={styles.emptyBtnText}>+ Add First Activity</Text>
              </TouchableOpacity>
            </View>
          ) : (
            [...day.activities].sort((a, b) => a.time.localeCompare(b.time)).map(act => (
              <ActivityCard key={act.id} activity={act} trip={trip} onDelete={() => deleteActivity(trip.id, act.id)} />
            ))
          )}
        </View>
      </ScrollView>

      <AddActivityModal visible={showAddActivity} trip={trip} currentDay={currentDay} onClose={() => setShowAddActivity(false)} />
    </View>
  );
}

function ActivityCard({ activity: act, trip, onDelete }) {
  const famChips = act.costPerPerson > 0 ? trip.families.map(fam => ({
    ...fam, cost: fam.members.length * act.costPerPerson,
  })) : [];

  return (
    <View style={[styles.actCard, { borderLeftColor: activityColors[act.type] || colors.muted }]}>
      <View style={styles.actTimeCol}>
        <Text style={styles.actTime}>{act.time}</Text>
        <Text style={styles.actIcon}>{activityIcons[act.type] || '📌'}</Text>
      </View>
      <View style={styles.actBody}>
        <Text style={styles.actName}>{act.name}</Text>
        {!!act.detail && <Text style={styles.actDetail}>{act.detail}</Text>}
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
      <TouchableOpacity style={styles.delBtn} onPress={onDelete}>
        <Text style={styles.delBtnText}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingBottom: 100 },
  // Banner
  banner: { margin: spacing.xxl, borderRadius: radius.lg, backgroundColor: '#1a1714', padding: spacing.xl },
  bannerTotal: { marginBottom: spacing.md },
  bannerLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerAmt: { fontSize: 28, fontWeight: '900', color: colors.yellow, lineHeight: 32, marginTop: 4 },
  bannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  bannerDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: spacing.md },
  famScroll: { marginBottom: spacing.md },
  famCol: { marginRight: spacing.xl },
  famName: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  famAmt: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 2 },
  famSub: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  pushBtn: { backgroundColor: colors.green, borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  pushBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  // Day nav
  dayNav: { marginVertical: spacing.md },
  dayBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, marginRight: 8 },
  dayBtnActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  dayBtnLabel: { ...typography.smallBold, color: colors.text },
  dayBtnLabelActive: { color: colors.primary },
  dayBtnDate: { ...typography.tiny, color: colors.muted, marginTop: 1 },
  dayCost: { ...typography.tinyBold, color: colors.green, marginTop: 2 },
  // Day header
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xxl, marginBottom: spacing.md },
  dayTitle: { ...typography.h4, color: colors.text },
  addActBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 6 },
  addActBtnText: { ...typography.smallBold, color: colors.primary },
  // Cost strip
  costStrip: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginHorizontal: spacing.xxl, marginBottom: spacing.md, overflow: 'hidden' },
  stripItem: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  stripDivider: { width: 1, backgroundColor: colors.border },
  stripLabel: { fontSize: 10, color: colors.muted, textTransform: 'uppercase', fontWeight: '600' },
  stripVal: { ...typography.bodyBold, color: colors.text, marginTop: 2 },
  // Family pills
  famPills: { flexDirection: 'row', gap: 8, paddingVertical: spacing.sm, paddingRight: spacing.xxl },
  famPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 5 },
  famDot: { width: 8, height: 8, borderRadius: 4 },
  famPillName: { ...typography.tinyBold, color: colors.muted },
  famPillAmt: { ...typography.tinyBold, color: colors.text },
  // Activities
  activities: { paddingHorizontal: spacing.xxl, gap: 10 },
  empty: { backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg, padding: 32, alignItems: 'center' },
  emptyText: { ...typography.body, color: colors.muted, marginBottom: 12 },
  emptyBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.sm, paddingHorizontal: 16, paddingVertical: 8 },
  emptyBtnText: { ...typography.smallBold, color: colors.primary },
  // Activity card
  actCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, padding: spacing.md, flexDirection: 'row', gap: 12, ...shadow.sm },
  actTimeCol: { alignItems: 'center', minWidth: 50 },
  actTime: { ...typography.smallBold, color: colors.primary },
  actIcon: { fontSize: 20, marginTop: 4 },
  actBody: { flex: 1 },
  actName: { ...typography.bodyBold, color: colors.text },
  actDetail: { ...typography.small, color: colors.muted, marginTop: 3 },
  actTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },
  costBadge: { backgroundColor: colors.yellowLight, borderWidth: 1, borderColor: '#f0d080', borderRadius: radius.full, paddingHorizontal: 9, paddingVertical: 2 },
  costBadgeText: { fontSize: 11, fontWeight: '700', color: '#9b6e00' },
  famChips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  famChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  famChipDot: { width: 6, height: 6, borderRadius: 3 },
  famChipText: { fontSize: 11, color: colors.muted },
  delBtn: { padding: 4 },
  delBtnText: { fontSize: 16 },
});
