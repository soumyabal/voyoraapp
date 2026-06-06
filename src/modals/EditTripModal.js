import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { FormField, ModalHeader, DateRangePicker, LocationSearchField } from '../components/ui';
import { fmt, fmtM } from '../utils/helpers';
import { useKeyboardOffset } from '../utils/useKeyboardOffset';

// Inclusive day count for a 'YYYY-MM-DD' range (8 nights → 9 days). 0 for an invalid range.
const daysInRange = (s, e) => {
  if (!s || !e) return 0;
  const n = Math.floor((new Date(e + 'T00:00:00') - new Date(s + 'T00:00:00')) / 86400000) + 1;
  return n > 0 ? n : 0;
};

export default function EditTripModal({ visible, trip, onClose }) {
  const { updateTrip, duplicateTrip, resizeTripDates } = useStore();
  const kbOffset = useKeyboardOffset();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [origin, setOrigin] = useState(null);   // { label, lat, lng } | null
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Seed fields from trip whenever modal opens
  useEffect(() => {
    if (visible && trip) {
      setName(trip.name || '');
      setDestination(trip.destination || '');
      setOrigin(trip.origin || null);
      setStartDate(trip.startDate || '');
      setEndDate(trip.endDate || '');
    }
  }, [visible, trip]);

  const handleClose = () => onClose();

  // Date-range resize math. Changing dates no longer silently leaves stale days OR nukes the
  // trip — resizeTripDates preserves the first N days and drops only the tail. We warn first
  // when that shrink would actually delete planned activities / linked expenses.
  const datesChanged = trip && (startDate !== trip.startDate || endDate !== trip.endDate);
  const newCount = daysInRange(startDate, endDate);
  const oldCount = trip?.days?.length || 0;
  const shrinking = datesChanged && newCount > 0 && newCount < oldCount;
  // The tail that would be removed (Day newCount+1 … oldCount) and what's on it.
  const droppedDays  = shrinking ? (trip.days || []).slice(newCount) : [];
  const droppedActIds = new Set(droppedDays.flatMap(d => (d.activities || []).map(a => a.id)));
  const droppedActs  = droppedDays.reduce((n, d) => n + (d.activities || []).filter(a => a.type !== 'note').length, 0);
  const droppedExp   = (trip?.expenses || []).filter(e => e.activityId && droppedActIds.has(e.activityId));
  const droppedExpSum = droppedExp.reduce((s, e) => s + (e.amount || 0), 0);
  const losesData    = droppedActs > 0 || droppedExp.length > 0;
  const lostBits = () => {
    const b = [];
    if (droppedActs) b.push(`${droppedActs} ${droppedActs === 1 ? 'activity' : 'activities'}`);
    if (droppedExp.length) b.push(`${fmtM(droppedExpSum)} in linked expenses`);
    return b.join(' and ');
  };

  // No date change → plain field update (days untouched).
  const doSave = () => {
    updateTrip(trip.id, {
      name: name.trim(), destination: destination.trim(),
      origin: origin && origin.label ? origin : null,
      startDate, endDate,
    });
    onClose();
  };
  // Date change → save scalar fields, then resize days safely (re-date / add empties / drop tail).
  const doResize = () => {
    updateTrip(trip.id, {
      name: name.trim(), destination: destination.trim(),
      origin: origin && origin.label ? origin : null,
    });
    resizeTripDates(trip.id, startDate, endDate);
    onClose();
  };

  const handleSave = () => {
    if (!name.trim() || !destination.trim()) return;

    if (datesChanged) {
      // Only a shrink that DELETES planned data needs the warning — adding/redating is safe.
      if (shrinking && losesData) {
        Alert.alert(
          `Remove Day ${newCount + 1}–${oldCount}?`,
          `Shrinking to ${newCount} day${newCount === 1 ? '' : 's'} drops Day ${newCount + 1}–${oldCount}, deleting ${lostBits()}. Day 1–${newCount} keep everything. This can’t be undone.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Duplicate first',
              onPress: () => { duplicateTrip(trip.id); showToast('Duplicate created — find it on the home screen 📋', '✅'); onClose(); },
            },
            { text: 'Drop & save', style: 'destructive', onPress: doResize },
          ],
        );
        return;
      }
      doResize();
      return;
    }

    doSave();
  };

  const canSave = name.trim() && destination.trim();
  const dateLabel = startDate && endDate
    ? `${fmt(startDate)}  →  ${fmt(endDate)}`
    : startDate ? fmt(startDate) : 'Select dates';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.container, { paddingBottom: kbOffset }]}>
          <ModalHeader
            title="Edit Trip"
            closeLabel="Cancel"
            actionLabel="Save"
            onClose={handleClose}
            onAction={handleSave}
            actionDisabled={!canSave}
            actionColor={colors.green}
          />

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <FormField
              label="Trip Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bali Family Adventure"
              autoFocus
            />
            <LocationSearchField
              label="Destination *"
              value={destination}
              onSelect={setDestination}
              placeholder="e.g. Bali, Indonesia"
            />
            <LocationSearchField
              label="Starting Point"
              value={origin?.label || ''}
              onSelect={(label, coords) => setOrigin(label ? { label, lat: coords?.lat ?? null, lng: coords?.lng ?? null } : null)}
              placeholder="Arrival airport, hotel, or home (optional)"
            />
            <Text style={styles.originHint}>📍 Where Day 1 begins — anchors the first stop&apos;s travel time.</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Travel Dates</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateBtnIcon}>📅</Text>
                <Text style={[styles.dateBtnText, (!startDate && !endDate) && styles.datePlaceholder]}>
                  {dateLabel}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline guidance — tells you exactly what saving will do to the day range */}
            {datesChanged && (() => {
              const warn = shrinking && losesData;
              const text = warn
                ? `Saving removes Day ${newCount + 1}–${oldCount} and deletes ${lostBits()}. Day 1–${newCount} are kept. Tip: “Duplicate first” to keep the original safe.`
                : shrinking
                  ? `Day ${newCount + 1}–${oldCount} are empty and will be removed.`
                  : newCount > oldCount
                    ? `${newCount - oldCount} empty day${newCount - oldCount === 1 ? '' : 's'} will be added — your existing days are kept.`
                    : 'Dates updated — your days keep their plans.';
              return (
                <View style={[styles.noteBanner, warn && styles.warnBanner]}>
                  <Text style={styles.noteIcon}>{warn ? '⚠️' : 'ℹ️'}</Text>
                  <Text style={[styles.noteText, warn && styles.warnText]}>{text}</Text>
                </View>
              );
            })()}
          </ScrollView>
        </View>

      <DateRangePicker
        visible={showDatePicker}
        startDate={startDate}
        endDate={endDate}
        onConfirm={(s, e) => { setStartDate(s); setEndDate(e); }}
        onClose={() => setShowDatePicker(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  formGroup: { marginBottom: spacing.lg },
  label: { fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  originHint: { ...typography.caption, color: colors.muted, marginTop: -spacing.md + 2, marginBottom: spacing.lg, lineHeight: 16 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: colors.surface },
  dateBtnIcon: { fontSize: 16 },
  dateBtnText: { ...typography.small, color: colors.text, fontWeight: '600' },
  datePlaceholder: { color: colors.muted, fontWeight: '400' },
  noteBanner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  warnBanner: { backgroundColor: '#fff8e6', borderColor: '#f59e0b' },
  noteIcon: { fontSize: 16 },
  noteText: { ...typography.small, color: colors.muted, flex: 1, lineHeight: 18 },
  warnText: { color: '#92400e' },
});
