import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { FormField, ModalHeader, DateRangePicker } from '../components/ui';
import { fmt } from '../utils/helpers';

export default function EditTripModal({ visible, trip, onClose }) {
  const { updateTrip } = useStore();

  const [name, setName] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Seed fields from trip whenever modal opens
  useEffect(() => {
    if (visible && trip) {
      setName(trip.name || '');
      setDestination(trip.destination || '');
      setStartDate(trip.startDate || '');
      setEndDate(trip.endDate || '');
    }
  }, [visible, trip]);

  const handleClose = () => onClose();

  const handleSave = () => {
    if (!name.trim() || !destination.trim()) return;
    updateTrip(trip.id, {
      name: name.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
    });
    onClose();
  };

  const canSave = name.trim() && destination.trim();
  const dateLabel = startDate && endDate
    ? `${fmt(startDate)}  →  ${fmt(endDate)}`
    : startDate ? fmt(startDate) : 'Select dates';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
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
            <FormField
              label="Destination *"
              value={destination}
              onChangeText={setDestination}
              placeholder="e.g. Bali, Indonesia"
            />

            <View style={styles.formGroup}>
              <Text style={styles.label}>Travel Dates</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateBtnIcon}>📅</Text>
                <Text style={[styles.dateBtnText, (!startDate && !endDate) && styles.datePlaceholder]}>
                  {dateLabel}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Note about itinerary */}
            {trip?.days?.length > 0 && (
              <View style={styles.noteBanner}>
                <Text style={styles.noteIcon}>ℹ️</Text>
                <Text style={styles.noteText}>
                  Editing dates won't change existing itinerary days. Add or remove activities manually.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

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
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 13, paddingVertical: 12, backgroundColor: colors.surface },
  dateBtnIcon: { fontSize: 16 },
  dateBtnText: { ...typography.small, color: colors.text, fontWeight: '600' },
  datePlaceholder: { color: colors.muted, fontWeight: '400' },
  noteBanner: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  noteIcon: { fontSize: 16 },
  noteText: { ...typography.small, color: colors.muted, flex: 1, lineHeight: 18 },
});
