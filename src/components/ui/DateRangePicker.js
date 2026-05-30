import React, { useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(str) {
  return str ? toMidnight(new Date(str)) : null;
}

function formatDate(date) {
  return date ? date.toISOString().split('T')[0] : '';
}

function formatDisplay(date) {
  if (!date) return null;
  return `${MONTHS[date.getMonth()].slice(0, 3)} ${date.getDate()}, ${date.getFullYear()}`;
}

function isSameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isInRange(day, start, end) {
  return start && end && day > start && day < end;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

/**
 * DateRangePicker
 * Travel-site style date range picker modal.
 *
 * Props:
 *   visible      bool
 *   startDate    string (YYYY-MM-DD)
 *   endDate      string (YYYY-MM-DD)
 *   onConfirm    fn(startDate, endDate)
 *   onClose      fn
 */
export default function DateRangePicker({ visible, startDate, endDate, onConfirm, onClose }) {
  const today = toMidnight(new Date());

  const [viewYear, setViewYear] = useState(() => {
    const d = parseDate(startDate) || today;
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDate(startDate) || today;
    return d.getMonth();
  });
  const [selStart, setSelStart] = useState(() => parseDate(startDate));
  const [selEnd, setSelEnd] = useState(() => parseDate(endDate));
  const [phase, setPhase] = useState('start'); // 'start' | 'end'

  const nights = selStart && selEnd
    ? Math.round((selEnd - selStart) / 86400000)
    : 0;

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDayPress = (dayNum) => {
    const tapped = toMidnight(new Date(viewYear, viewMonth, dayNum));
    if (tapped < today) return; // past — ignore

    if (phase === 'start') {
      setSelStart(tapped);
      setSelEnd(null);
      setPhase('end');
    } else {
      if (tapped < selStart) {
        // Tapped before start — reset start
        setSelStart(tapped);
        setSelEnd(null);
        setPhase('end');
      } else if (isSameDay(tapped, selStart)) {
        // Tapped same day — single day trip
        setSelEnd(tapped);
        setPhase('start');
      } else {
        setSelEnd(tapped);
        setPhase('start');
      }
    }
  };

  const handleConfirm = () => {
    if (!selStart) return;
    onConfirm(formatDate(selStart), formatDate(selEnd || selStart));
    onClose();
  };

  const handleClear = () => {
    setSelStart(null);
    setSelEnd(null);
    setPhase('start');
  };

  // Build calendar cells
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const cells = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const getDayState = (dayNum) => {
    if (!dayNum) return 'empty';
    const date = toMidnight(new Date(viewYear, viewMonth, dayNum));
    if (date < today) return 'past';
    if (isSameDay(date, selStart)) return 'start';
    if (isSameDay(date, selEnd)) return 'end';
    if (isInRange(date, selStart, selEnd)) return 'range';
    if (isSameDay(date, today)) return 'today';
    return 'normal';
  };

  const isRangeEdge = (dayNum) => {
    if (!dayNum) return { isStart: false, isEnd: false };
    const date = toMidnight(new Date(viewYear, viewMonth, dayNum));
    return { isStart: isSameDay(date, selStart), isEnd: isSameDay(date, selEnd) };
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.topTitle}>Select Dates</Text>
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Selected dates summary */}
        <View style={styles.summary}>
          <View style={[styles.summaryBox, phase === 'start' && styles.summaryBoxActive]}>
            <Text style={styles.summaryLabel}>CHECK-IN</Text>
            <Text style={[styles.summaryDate, !selStart && styles.summaryPlaceholder]}>
              {selStart ? formatDisplay(selStart) : 'Add date'}
            </Text>
          </View>
          <View style={styles.summaryArrow}>
            <Text style={styles.summaryArrowText}>→</Text>
          </View>
          <View style={[styles.summaryBox, phase === 'end' && styles.summaryBoxActive]}>
            <Text style={styles.summaryLabel}>CHECK-OUT</Text>
            <Text style={[styles.summaryDate, !selEnd && styles.summaryPlaceholder]}>
              {selEnd ? formatDisplay(selEnd) : 'Add date'}
            </Text>
          </View>
        </View>

        {nights > 0 && (
          <View style={styles.nightsBanner}>
            <Text style={styles.nightsText}>🌙 {nights} night{nights !== 1 ? 's' : ''}</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.calendarArea}>
          {/* Month navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.navBtn} onPress={goToPrevMonth}>
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
            <TouchableOpacity style={styles.navBtn} onPress={goToNextMonth}>
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={styles.weekRow}>
            {DAYS_OF_WEEK.map(d => (
              <Text key={d} style={styles.weekLabel}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={styles.grid}>
            {cells.map((dayNum, idx) => {
              const state = getDayState(dayNum);
              const { isStart, isEnd } = isRangeEdge(dayNum);
              const inRange = state === 'range';
              const isEdge = isStart || isEnd;

              return (
                <View key={idx} style={styles.cellOuter}>
                  {/* Range background strip */}
                  {(inRange || (isEdge && selStart && selEnd)) && (
                    <View style={[
                      styles.rangeStrip,
                      isStart && styles.rangeStripStart,
                      isEnd && styles.rangeStripEnd,
                    ]} />
                  )}

                  <TouchableOpacity
                    style={[
                      styles.cell,
                      isEdge && styles.cellEdge,
                      state === 'today' && styles.cellToday,
                    ]}
                    onPress={() => dayNum && handleDayPress(dayNum)}
                    disabled={!dayNum || state === 'past'}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.cellText,
                      isEdge && styles.cellTextEdge,
                      state === 'past' && styles.cellTextPast,
                      state === 'today' && styles.cellTextToday,
                      inRange && styles.cellTextRange,
                    ]}>
                      {dayNum || ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Phase hint */}
          <Text style={styles.phaseHint}>
            {!selStart
              ? 'Tap a date to set check-in'
              : !selEnd
                ? 'Now tap a date to set check-out'
                : `${nights} night trip selected`}
          </Text>
        </ScrollView>

        {/* Confirm button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.confirmBtn, !selStart && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selStart}
          >
            <Text style={styles.confirmBtnText}>
              {selStart && selEnd ? `Confirm · ${nights} night${nights !== 1 ? 's' : ''}` : 'Confirm Dates'}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  );
}

const CELL_SIZE = 44;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cancelBtn: { minWidth: 60 },
  cancelText: { ...typography.body, color: colors.muted },
  topTitle: { ...typography.h4, color: colors.text },
  clearBtn: { minWidth: 60, alignItems: 'flex-end' },
  clearText: { ...typography.body, color: colors.primary },

  // Summary bar
  summary: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  summaryBox: { flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md },
  summaryBoxActive: { backgroundColor: colors.primaryLight, borderWidth: 1.5, borderColor: colors.primary },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  summaryDate: { ...typography.smallBold, color: colors.text, marginTop: 3 },
  summaryPlaceholder: { color: colors.muted, fontWeight: '400' },
  summaryArrow: { paddingHorizontal: spacing.sm },
  summaryArrowText: { fontSize: 18, color: colors.muted },

  // Nights banner
  nightsBanner: {
    backgroundColor: colors.primaryLight, alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  nightsText: { ...typography.smallBold, color: colors.primary },

  calendarArea: { paddingBottom: 100 },

  // Month nav
  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.xl,
  },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 22, color: colors.text, fontWeight: '600', lineHeight: 26 },
  monthTitle: { ...typography.h4, color: colors.text },

  // Day headers
  weekRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg },
  cellOuter: { width: '14.28%', height: CELL_SIZE + 8, alignItems: 'center', justifyContent: 'center', position: 'relative' },

  // Range strip (horizontal band between start and end)
  rangeStrip: {
    position: 'absolute', top: 4, bottom: 4, left: 0, right: 0,
    backgroundColor: colors.primaryLight,
  },
  rangeStripStart: { left: '50%', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  rangeStripEnd: { right: '50%', borderTopRightRadius: 0, borderBottomRightRadius: 0 },

  // Day cell
  cell: { width: CELL_SIZE, height: CELL_SIZE, borderRadius: CELL_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  cellEdge: { backgroundColor: colors.primary },
  cellToday: { borderWidth: 1.5, borderColor: colors.primary },

  // Day text
  cellText: { fontSize: 15, fontWeight: '500', color: colors.text },
  cellTextEdge: { color: '#fff', fontWeight: '800' },
  cellTextPast: { color: colors.border },
  cellTextToday: { color: colors.primary, fontWeight: '700' },
  cellTextRange: { color: colors.primary },

  // Hint
  phaseHint: { ...typography.small, color: colors.muted, textAlign: 'center', marginTop: spacing.xl, paddingHorizontal: spacing.xxl },

  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xxl, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.border },
  confirmBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
