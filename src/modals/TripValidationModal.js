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

import React, { useMemo } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { colors, spacing, radius, typography, shadow } from '../theme';
import {
  validateTrip, groupWarningsByDay, summariseWarnings,
} from '../utils/tripValidator';

const SEV = {
  error:   { bg: '#fef2f2', border: '#fecaca', icon: '#ef4444', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '#f59e0b', text: '#78350f' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', icon: '#3b82f6', text: '#1e3a8a' },
};

/** Stable key for a warning — used to remember ignores per trip */
function warningKey(w) {
  return `${w.type}:${w.dayIndex ?? 'trip'}`;
}

export default function TripValidationModal({ visible, trip, onClose, onNavigate, onIgnore, onClearIgnored }) {
  const allWarnings = useMemo(
    () => (trip && visible ? validateTrip(trip) : []),
    [trip, visible],
  );

  const ignoredKeys  = trip?.ignoredWarnings || [];
  const warnings     = useMemo(
    () => allWarnings.filter(w => !ignoredKeys.includes(warningKey(w))),
    [allWarnings, ignoredKeys],
  );
  const ignoredCount = allWarnings.length - warnings.length;

  const byDay   = useMemo(() => groupWarningsByDay(warnings, trip), [warnings, trip]);
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

        {/* Summary row */}
        <View style={s.summaryRow}>
          {summary.errors > 0 && (
            <View style={[s.summaryPill, { backgroundColor: SEV.error.bg, borderColor: SEV.error.border }]}>
              <Text style={[s.summaryPillText, { color: SEV.error.text }]}>
                🔴 {summary.errors} conflict{summary.errors !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {summary.warnings > 0 && (
            <View style={[s.summaryPill, { backgroundColor: SEV.warning.bg, borderColor: SEV.warning.border }]}>
              <Text style={[s.summaryPillText, { color: SEV.warning.text }]}>
                🟠 {summary.warnings} warning{summary.warnings !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {summary.infos > 0 && (
            <View style={[s.summaryPill, { backgroundColor: SEV.info.bg, borderColor: SEV.info.border }]}>
              <Text style={[s.summaryPillText, { color: SEV.info.text }]}>
                🔵 {summary.infos} suggestion{summary.infos !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
          {warnings.length === 0 && (
            <View style={[s.summaryPill, { backgroundColor: '#f0fdf4', borderColor: '#a7f3d0' }]}>
              <Text style={[s.summaryPillText, { color: '#065f46' }]}>✅ All clear</Text>
            </View>
          )}
        </View>

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
                  <Text style={s.dayLabel}>📅 {dayLabel}</Text>
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
                          <Text style={s.cardIcon}>{w.icon}</Text>
                          <Text style={[s.cardTitle, { color: col.text }]}>{w.title}</Text>
                          <Text style={[s.cardArrow, { color: col.icon }]}>›</Text>
                        </View>
                        <Text style={[s.cardMsg, { color: col.text }]}>{w.message}</Text>
                        {!!w.hint && (
                          <Text style={[s.cardHint, { color: col.text }]}>
                            💡 {w.hint}
                          </Text>
                        )}
                        {/* Footer: Ignore (left) + Go to day (right) */}
                        <View style={[s.navFooter, { borderTopColor: col.border }]}>
                          <TouchableOpacity
                            onPress={() => handleIgnore(w)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.6}
                          >
                            <Text style={s.ignoreText}>Ignore for this trip</Text>
                          </TouchableOpacity>
                          <Text style={[s.navFooterText, { color: col.icon }]}>{navLabel(w)}</Text>
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
            <Text style={s.refTitle}>⏱ Duration estimates used</Text>
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
  summaryPillText: { fontSize: 12, fontWeight: '700' },

  scroll:  { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 60 },

  allClear: { alignItems: 'center', paddingVertical: 48 },
  allClearEmoji: { fontSize: 52, marginBottom: 12 },
  allClearTitle: { ...typography.h3, color: colors.text, marginBottom: 8 },
  allClearBody:  { ...typography.body, color: colors.muted, textAlign: 'center', lineHeight: 22 },

  daySection: { marginBottom: spacing.xl },
  dayLabel: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },

  card: {
    borderWidth: 1, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  cardIcon:   { fontSize: 16 },
  cardTitle:  { fontSize: 13, fontWeight: '800', flex: 1 },
  cardMsg:    { fontSize: 12, lineHeight: 18 },
  cardHint:   { fontSize: 11, lineHeight: 17, marginTop: 6, opacity: 0.8 },
  cardArrow:  { fontSize: 18, fontWeight: '700', marginLeft: 'auto' },
  navFooter:  { marginTop: 10, paddingTop: 8, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navFooterText: { fontSize: 12, fontWeight: '700' },
  ignoreText: { fontSize: 11, color: colors.muted, fontWeight: '500' },
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
