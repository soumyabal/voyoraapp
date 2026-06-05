/**
 * TripValidationModal.js
 *
 * Displays trip validation results from tripValidator.js.
 * Grouped by day, colour-coded by severity.
 *
 * Severity colours:
 *   error   → red   — likely conflict (overlap > 90 min)
 *   warning → amber — potential issue
 *   info    → blue  — suggestion / heads-up
 */

import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Linking,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme';
import Icon from '../components/ui/Icon';
import useStore from '../store';
import {
  validateTrip, groupWarningsByDay, summariseWarnings,
} from '../utils/tripValidator';
import { checkDistances, countLocatedActivityPairs, isCacheFresh } from '../utils/distanceChecker';
import { RELEASE_FLAGS, GOOGLE_PLACES_API_KEY } from '../config';

const SEV = {
  error:   { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444', text: '#991b1b', ic: 'close-circle' },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b', text: '#78350f', ic: 'warning-outline' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', icon: '#3b82f6', text: '#1e3a8a', ic: 'bulb-outline' },
};

/** Stable key for a warning — used to remember ignores per trip */
function warningKey(w) {
  return `${w.type}:${w.dayIndex ?? 'trip'}`;
}

export default function TripValidationModal({ visible, trip, onClose, onNavigate, onIgnore, onClearIgnored }) {
  const { updateActivity, moveActivity, updateDistanceCache, preferences, setDistanceCheckEnabled } = useStore();
  const distanceEnabled = preferences?.distanceCheckEnabled ?? false;
  const [activeFilter,    setActiveFilter]    = useState(null);
  const [distanceLoading, setDistanceLoading] = useState(false);

  // Distance state sourced from trip.distanceCache (persistent)
  const cachedDistance  = trip?.distanceCache || null;
  const cacheIsFresh    = trip ? isCacheFresh(trip) : false;
  const distanceWarnings = cacheIsFresh ? (cachedDistance?.warnings || []) : [];
  const pairCount        = trip ? countLocatedActivityPairs(trip) : 0;

  const checkedAgo = cachedDistance?.checkedAt
    ? (() => {
        const mins = Math.floor((Date.now() - cachedDistance.checkedAt) / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return `${mins} min ago`;
        const h = Math.floor(mins / 60);
        return `${h}h ago`;
      })()
    : null;

  const runDistanceCheck = async (forceRefresh = false) => {
    if (!trip || distanceLoading) return;
    setDistanceLoading(true);
    try {
      const result = await checkDistances(trip, { forceRefresh });
      if (result && !result.fromCache) {
        updateDistanceCache(trip.id, {
          fingerprint: result.fingerprint,
          warnings:    result.warnings,
          checkedAt:   result.checkedAt,
        });
      }
    } catch (e) {
      console.warn('[TripValidationModal] distance check failed:', e.message);
    } finally {
      setDistanceLoading(false);
    }
  };

  const allWarnings = useMemo(
    () => (trip && visible ? validateTrip(trip) : []),
    [trip, visible],
  );

  const ignoredKeys  = trip?.ignoredWarnings || [];

  // Merge sync + distance warnings (only when enabled + cache fresh)
  const allMerged = useMemo(
    () => distanceEnabled ? [...allWarnings, ...distanceWarnings] : allWarnings,
    [allWarnings, distanceWarnings, distanceEnabled],
  );
  const warnings = useMemo(
    () => allMerged.filter(w => !ignoredKeys.includes(warningKey(w))),
    [allMerged, ignoredKeys],
  );
  const ignoredCount = allMerged.length - warnings.length;

  // Apply severity filter
  const filtered = useMemo(
    () => activeFilter ? warnings.filter(w => w.severity === activeFilter) : warnings,
    [warnings, activeFilter],
  );

  const byDay   = useMemo(() => groupWarningsByDay(filtered, trip), [filtered, trip]);
  const summary = useMemo(() => summariseWarnings(warnings),        [warnings]);

  if (!trip) return null;

  const dayKeys = Object.keys(byDay).sort((a, b) =>
    a === 'trip' ? 1 : b === 'trip' ? -1 : Number(a) - Number(b)
  );

  const handleNavigate = (w) => {
    if (onNavigate) onNavigate(w);
    onClose();
  };

  const handleIgnore = (w) => {
    if (onIgnore) onIgnore(warningKey(w));
  };

  const handleApplyFix = (w) => {
    if (w.moveActId && w.suggestedTime) {
      updateActivity(trip.id, w.moveActId, { time: w.suggestedTime });
    }
    handleIgnore(w);
  };

  // Per-activity fix: move time (overlap) or move to another day (journey conflict)
  const handleActivityFix = (w, act) => {
    if (act.suggestedTime) {
      updateActivity(trip.id, act.id, { time: act.suggestedTime });
    } else if (act.suggestedDayIndex != null) {
      moveActivity(trip.id, w.dayIndex, act.suggestedDayIndex, act.id);
    }
  };

  const toggleFilter = (sev) => setActiveFilter(prev => prev === sev ? null : sev);

  const navLabel = (w) => {
    const day = w.dayIndex != null ? trip.days[w.dayIndex] : null;
    if (w.actIds?.length) return day ? `Jump to ${day.label} →` : 'Jump to itinerary →';
    if (day)              return `Go to ${day.label} →`;
    return 'Go to itinerary →';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={s.container}>

        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Trip Check</Text>
            <Text style={s.subtitle}>{trip.name}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Severity filter chips — tap to filter, tap again to clear */}
        <View style={s.summaryRow}>
          {summary.errors > 0 && (
            <TouchableOpacity
              style={[s.summaryPill, { backgroundColor: SEV.error.bg, borderColor: SEV.error.border }, activeFilter === 'error' && s.summaryPillActive]}
              onPress={() => toggleFilter('error')}
              activeOpacity={0.7}
            >
              <Text style={[s.summaryPillText, { color: SEV.error.text }]}>
                🔴 {summary.errors} to fix{activeFilter === 'error' ? ' ✕' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {summary.warnings > 0 && (
            <TouchableOpacity
              style={[s.summaryPill, { backgroundColor: SEV.warning.bg, borderColor: SEV.warning.border }, activeFilter === 'warning' && s.summaryPillActive]}
              onPress={() => toggleFilter('warning')}
              activeOpacity={0.7}
            >
              <Text style={[s.summaryPillText, { color: SEV.warning.text }]}>
                🟠 {summary.warnings} to check{activeFilter === 'warning' ? ' ✕' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {summary.infos > 0 && (
            <TouchableOpacity
              style={[s.summaryPill, { backgroundColor: SEV.info.bg, borderColor: SEV.info.border }, activeFilter === 'info' && s.summaryPillActive]}
              onPress={() => toggleFilter('info')}
              activeOpacity={0.7}
            >
              <Text style={[s.summaryPillText, { color: SEV.info.text }]}>
                🔵 {summary.infos} tip{summary.infos !== 1 ? 's' : ''}{activeFilter === 'info' ? ' ✕' : ''}
              </Text>
            </TouchableOpacity>
          )}
          {warnings.length === 0 && (
            <View style={[s.summaryPill, { backgroundColor: '#f0fdf4', borderColor: '#a7f3d0' }]}>
              <Text style={[s.summaryPillText, { color: '#065f46' }]}>✅ All clear</Text>
            </View>
          )}
        </View>

        {/* Distance check bar — always shown when feature is available */}
        {RELEASE_FLAGS.distanceWarnings && GOOGLE_PLACES_API_KEY ? (
          <View style={s.distanceBar}>
            {!distanceEnabled ? (
              // OFF state — show enable nudge
              <>
                <Icon name="map-outline" size={14} color={colors.muted} />
                <Text style={[s.distanceBarText, { flex: 1, color: colors.muted }]}>
                  Distance check off
                </Text>
                <TouchableOpacity
                  style={s.distanceToggleBtn}
                  onPress={() => setDistanceCheckEnabled(true)}
                  activeOpacity={0.75}
                >
                  <Text style={s.distanceToggleBtnText}>Enable</Text>
                </TouchableOpacity>
              </>
            ) : distanceLoading ? (
              // ON + loading
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[s.distanceBarText, { flex: 1 }]}>Checking travel times…</Text>
                <TouchableOpacity onPress={() => setDistanceCheckEnabled(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.distanceOffText}>Turn off</Text>
                </TouchableOpacity>
              </>
            ) : cacheIsFresh ? (
              // ON + cached result
              <>
                <Text style={[s.distanceBarText, { flex: 1 }]}>
                  {distanceWarnings.length > 0
                    ? `🗺️ ${distanceWarnings.length} travel time issue${distanceWarnings.length !== 1 ? 's' : ''}`
                    : '🗺️ Travel times OK'}
                  {checkedAgo ? `  ·  ${checkedAgo}` : ''}
                </Text>
                <TouchableOpacity onPress={() => runDistanceCheck(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.distanceRefresh}>Refresh</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDistanceCheckEnabled(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.distanceOffText}>Off</Text>
                </TouchableOpacity>
              </>
            ) : (
              // ON + not yet checked
              <>
                <Text style={[s.distanceBarText, { flex: 1 }]}>
                  {pairCount > 0
                    ? `🗺️ ${pairCount} venue pair${pairCount !== 1 ? 's' : ''} to check`
                    : '🗺️ Add venues via Discover to enable'}
                </Text>
                {pairCount > 0 && (
                  <TouchableOpacity style={s.distanceCheckBtn} onPress={() => runDistanceCheck(false)} activeOpacity={0.75}>
                    <Text style={s.distanceCheckBtnText}>Check</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setDistanceCheckEnabled(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.distanceOffText}>Off</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {warnings.length === 0 ? (
            <View style={s.allClear}>
              <Text style={s.allClearEmoji}>🎉</Text>
              <Text style={s.allClearTitle}>Looks great!</Text>
              <Text style={s.allClearBody}>
                No schedule conflicts or issues found. Your itinerary looks well-paced.
              </Text>
            </View>
          ) : (
            dayKeys.map(key => {
              const dayWarnings = byDay[key];
              const dayIndex    = key === 'trip' ? null : Number(key);
              const day         = dayIndex != null ? trip.days[dayIndex] : null;
              const dayLabel    = day ? `${day.label}  —  ${day.date}` : 'Trip Level';

              return (
                <View key={key} style={s.daySection}>
                  <View style={s.dayLabelRow}>
                    <Icon name="calendar" size={13} color={colors.subtle} />
                    <Text style={s.dayLabel}>{dayLabel}</Text>
                  </View>
                  {dayWarnings.map((w, i) => {
                    const col = SEV[w.severity] || SEV.info;
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.card, { backgroundColor: col.bg, borderColor: col.border }]}
                        onPress={() => handleNavigate(w)}
                        activeOpacity={0.75}
                      >
                        <View style={s.cardHeader}>
                          <Icon name={col.ic} size={16} color={col.icon} />
                          <Text style={[s.cardTitle, { color: col.text }]}>{w.title}</Text>
                          <Icon name="forward" size={15} color={col.icon} />
                        </View>
                        <Text style={[s.cardMsg, { color: col.text }]}>{w.message}</Text>
                        {!!w.hint && (
                          <View style={s.cardHintRow}>
                            <Icon name="bulb-outline" size={13} color={col.text} />
                            <Text style={[s.cardHint, { color: col.text }]}>{w.hint}</Text>
                          </View>
                        )}
                        {/* Live, authoritative hours — the source of truth our cached
                            weekly snapshot can't be for a future (esp. seasonal) date. */}
                        {!!w.verifyUrl && (
                          <TouchableOpacity
                            style={s.verifyBtn}
                            onPress={() => Linking.openURL(w.verifyUrl).catch(() => {})}
                            activeOpacity={0.75}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Icon name="open" size={13} color={col.icon} />
                            <Text style={[s.verifyText, { color: col.icon }]}>Check current hours</Text>
                          </TouchableOpacity>
                        )}

                        {/* Per-activity impact list */}
                        {w.impactedActivities?.length > 0 && (
                          <View style={[s.impactedList, { borderTopColor: col.border }]}>
                            {w.impactedActivities.map(act => (
                              <View key={act.id} style={s.impactedRow}>
                                <View style={s.impactedInfo}>
                                  <Text style={s.impactedTime}>{act.time}</Text>
                                  <Text style={[s.impactedName, { color: col.text }]} numberOfLines={1}>
                                    {act.name}
                                  </Text>
                                </View>
                                {(act.suggestedTime || act.suggestedDayIndex != null) && (
                                  <TouchableOpacity
                                    style={[s.impactedFixBtn, { borderColor: col.icon }]}
                                    onPress={() => handleActivityFix(w, act)}
                                    activeOpacity={0.75}
                                  >
                                    <Text style={[s.impactedFixText, { color: col.icon }]}>
                                      {act.suggestedTime
                                        ? `→ ${act.suggestedTime}`
                                        : `→ ${act.suggestedDayLabel}`}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Footer: Ignore (left) + Apply Fix or Jump to Day (right) */}
                        <View style={[s.navFooter, { borderTopColor: col.border }]}>
                          <TouchableOpacity
                            onPress={() => handleIgnore(w)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.6}
                          >
                            <Text style={s.ignoreText}>Ignore</Text>
                          </TouchableOpacity>

                          {w.impactedActivities?.length > 0 ? (
                            // Impacted activities shown above — footer just needs Jump to day
                            <TouchableOpacity
                              onPress={() => handleNavigate(w)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.7}
                            >
                              <Text style={[s.navFooterText, { color: col.icon }]}>{navLabel(w)}</Text>
                            </TouchableOpacity>
                          ) : (
                            // No impacted list — jump to day
                            <TouchableOpacity
                              onPress={() => handleNavigate(w)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.7}
                            >
                              <Text style={[s.navFooterText, { color: col.icon }]}>{navLabel(w)}</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })
          )}

          {/* Ignored warnings reset strip */}
          {ignoredCount > 0 && (
            <TouchableOpacity style={s.ignoredStrip} onPress={onClearIgnored} activeOpacity={0.75}>
              <Text style={s.ignoredStripText}>
                {ignoredCount} warning{ignoredCount !== 1 ? 's' : ''} hidden for this trip
              </Text>
              <Text style={s.ignoredStripReset}>Reset →</Text>
            </TouchableOpacity>
          )}

          {/* Duration reference */}
          <View style={s.refCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Icon name="time-outline" size={14} color={colors.text} />
              <Text style={[s.refTitle, { marginBottom: 0 }]}>Duration estimates used</Text>
            </View>
            <Text style={s.refBody}>
              These are typical visit durations based on global tourism data. Your actual experience may vary.
            </Text>
            {[
              ['✈️ Flight',         '3h (incl. airport time)'],
              ['🏨 Hotel check-in', '1h'],
              ['🍽️ Dinner',        '1h 45min'],
              ['🍽️ Lunch',         '1h 15min'],
              ['🍽️ Breakfast',     '45min'],
              ['🎡 Theme park',     '8h (full day)'],
              ['🦁 Zoo',            '4h'],
              ['🏛️ Museum',        '2h (major: 4h)'],
              ['🕌 Temple/church',  '1h'],
              ['🏖️ Beach',         '3h'],
              ['🥾 Hike',           '3h'],
              ['🛍️ Shopping',      '1.5h'],
              ['🎭 Show/concert',   '2.5h'],
            ].map(([label, dur]) => (
              <View key={label} style={s.refRow}>
                <Text style={s.refLabel}>{label}</Text>
                <Text style={s.refDur}>{dur}</Text>
              </View>
            ))}
          </View>

        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title:       { fontSize: 18, fontWeight: '800', color: colors.text },
  subtitle:    { fontSize: 12, color: colors.muted, marginTop: 2 },
  closeBtn:    { paddingTop: 2 },
  closeBtnText:{ fontSize: 15, fontWeight: '700', color: colors.primary },

  summaryRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryPill: {
    borderWidth: 1, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 5,
  },
  summaryPillActive: {
    borderWidth: 2,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  summaryPillText: { fontSize: 12, fontWeight: '700' },

  // Distance check bar
  distanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  distanceBarText:  { fontSize: 12, color: colors.muted, fontWeight: '600' },
  distanceRefresh:  { fontSize: 12, color: colors.primary, fontWeight: '700' },
  distanceOffText:  { fontSize: 11, color: colors.muted, fontWeight: '500' },
  distanceToggleBtn: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  distanceToggleBtnText: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  distanceCheckBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  distanceCheckBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 60 },

  allClear: { alignItems: 'center', paddingVertical: 48 },
  allClearEmoji: { fontSize: 52, marginBottom: 12 },
  allClearTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  allClearBody:  { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 22 },

  daySection: { marginBottom: spacing.xl },
  dayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
  dayLabel: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  card: {
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  cardIcon:   { fontSize: 16 },
  cardTitle:  { fontSize: 13, fontWeight: '800', flex: 1 },
  cardMsg:    { fontSize: 12, lineHeight: 18 },
  cardHintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 6, opacity: 0.85 },
  cardHint:   { fontSize: 11, lineHeight: 17, flex: 1 },
  verifyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  verifyText: { fontSize: 12, fontWeight: '800' },
  navFooter:     { marginTop: 10, paddingTop: 8, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navFooterText: { fontSize: 12, fontWeight: '700' },
  ignoreText:    { fontSize: 11, color: colors.muted, fontWeight: '500' },
  applyBtn: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  applyBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  // Per-activity impacted list
  impactedList: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.xs,
  },
  impactedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: spacing.sm,
  },
  impactedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  impactedTime: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    minWidth: 36,
  },
  impactedName: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  impactedFixBtn: {
    borderWidth: 1.5,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    flexShrink: 0,
  },
  impactedFixText: {
    fontSize: 11,
    fontWeight: '800',
  },
  ignoredStrip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface2, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  ignoredStripText: { fontSize: 12, color: colors.muted },
  ignoredStripReset: { fontSize: 12, fontWeight: '700', color: colors.primary },

  refCard: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl,
  },
  refTitle: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 6 },
  refBody:  { fontSize: 11, color: colors.muted, lineHeight: 16, marginBottom: spacing.md },
  refRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  refLabel: { fontSize: 12, color: colors.text },
  refDur:   { fontSize: 12, fontWeight: '600', color: colors.muted },
});
