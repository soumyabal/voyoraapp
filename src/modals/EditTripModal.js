import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { FormField, ModalHeader, DateRangePicker, LocationSearchField } from '../components/ui';
import { fmt } from '../utils/helpers';
import { useKeyboardOffset } from '../utils/useKeyboardOffset';

export default function EditTripModal({ visible, trip, onClose }) {
  const { updateTrip, duplicateTrip } = useStore();
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

  // Detect whether the user changed anything that breaks downstream data
  const datesChanged = trip && (startDate !== trip.startDate || endDate !== trip.endDate);
  const destChanged  = trip && destination.trim() !== (trip.destination || '').trim();
  const hasData      = trip && (
    trip.days?.some(d => d.activities?.length > 0) ||
    trip.expenses?.length > 0
  );
  const isDestructive = (datesChanged || destChanged) && hasData;

  const doSave = () => {
    updateTrip(trip.id, {
      name: name.trim(),
      destination: destination.trim(),
      origin: origin && origin.label ? origin : null,
      startDate,
      endDate,
    });
    onClose();
  };

  const handleSave = () => {
    if (!name.trim() || !destination.trim()) return;

    if (isDestructive) {
      Alert.alert(
        '⚠️ This will reset your trip',
        'Changing the date range or destination will reset your trip. Duplicate it instead to keep the original safe.',
        [
          {
            text: 'Duplicate Trip Instead',
            onPress: () => {
              duplicateTrip(trip.id);
              showToast('Duplicate created — find it on the home screen 📋', '✅');
              onClose();
            },
          },
          {
            text: 'Save Anyway',
            style: 'destructive',
            onPress: doSave,
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
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

            {/* Inline warning — escalates when destructive changes detected */}
            {hasData && (
              <View style={[styles.noteBanner, isDestructive && styles.warnBanner]}>
                <Text style={styles.noteIcon}>{isDestructive ? '⚠️' : 'ℹ️'}</Text>
                <Text style={[styles.noteText, isDestructive && styles.warnText]}>
                  {isDestructive
                    ? 'Changing the date range or destination will reset the trip. Duplicate it instead.'
                    : 'Editing dates won\'t change existing itinerary days. Add or remove activities manually.'}
                </Text>
              </View>
            )}
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
