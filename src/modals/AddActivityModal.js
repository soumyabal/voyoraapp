import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import { colors, spacing, activityIcons } from '../theme';
import { uid, ACTIVITY_TYPES } from '../utils/helpers';
import { ModalHeader, FormField, ChipSelector } from '../components/ui';

const ACCESS_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'Wheelchair', label: '♿ Wheelchair' },
  { value: 'Mobility Aid', label: '♿ Mobility Aid' },
  { value: 'Hearing Loop', label: '🔊 Hearing Loop' },
  { value: 'Visual Aid', label: '👁 Visual Aid' },
];

const activityOptions = ACTIVITY_TYPES.map(t => ({
  value: t.value, label: t.label, icon: activityIcons[t.value] || '📌',
}));

// editActivity — when provided, modal runs in edit mode
export default function AddActivityModal({ visible, trip, currentDay, onClose, editActivity }) {
  const { addActivity, updateActivity } = useStore();
  const isEdit = !!editActivity;

  const [name, setName]               = useState('');
  const [type, setType]               = useState('activity');
  const [time, setTime]               = useState('09:00');
  const [detail, setDetail]           = useState('');
  const [costPerPerson, setCost]      = useState('');
  const [access, setAccess]           = useState('');

  // Seed / re-seed fields whenever editActivity changes
  useEffect(() => {
    if (visible) {
      if (editActivity) {
        setName(editActivity.name || '');
        setType(editActivity.type || 'activity');
        setTime(editActivity.time || '09:00');
        setDetail(editActivity.detail || '');
        setCost(editActivity.costPerPerson > 0 ? String(editActivity.costPerPerson) : '');
        setAccess(editActivity.access || '');
      } else {
        setName(''); setType('activity'); setTime('09:00');
        setDetail(''); setCost(''); setAccess('');
      }
    }
  }, [visible, editActivity]);

  const handleClose = () => onClose();

  const handleSave = () => {
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      type,
      time,
      detail: detail.trim(),
      costPerPerson: parseFloat(costPerPerson) || 0,
      access,
    };

    if (isEdit) {
      updateActivity(trip.id, editActivity.id, payload);
    } else {
      addActivity(trip.id, currentDay, { ...payload, id: uid() });
    }
    handleClose();
  };

  const totalMembers = trip.families.reduce((s, f) => s + f.members.length, 0);
  const parsedCost   = parseFloat(costPerPerson);
  const totalCost    = parsedCost > 0 ? (parsedCost * totalMembers).toFixed(2) : null;
  const syncNote     = trip.itineraryPushed
    ? isEdit
      ? '✅ Splitwise expense will update automatically'
      : costPerPerson ? '✅ Will be added to Splitwise automatically' : null
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title={isEdit ? 'Edit Activity' : 'Add Activity'}
            onClose={handleClose}
            onAction={handleSave}
            actionLabel={isEdit ? 'Save' : 'Add'}
            actionDisabled={!name.trim()}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            <ChipSelector label="Type" options={activityOptions} selected={type} onSelect={setType} />

            <FormField label="Activity Name *" value={name} onChangeText={setName} placeholder="e.g. Snorkeling at Blue Lagoon" autoFocus={!isEdit} />
            <FormField label="Time" value={time} onChangeText={setTime} placeholder="09:00" keyboardType="numeric" />
            <FormField label="Details (optional)" value={detail} onChangeText={setDetail} placeholder="Notes, booking refs, meeting points…" multiline />
            <FormField label="Cost per Person ($)" value={costPerPerson} onChangeText={setCost} placeholder="0" keyboardType="decimal-pad" />

            {!!totalCost && (
              <View style={styles.costHint}>
                <Text style={styles.costHintText}>📊 {totalMembers} travelers · estimated total ${totalCost}</Text>
              </View>
            )}

            {!!syncNote && (
              <View style={styles.syncNote}>
                <Text style={styles.syncNoteText}>{syncNote}</Text>
              </View>
            )}

            <ChipSelector
              label="Accessibility"
              options={ACCESS_OPTIONS}
              selected={access}
              onSelect={setAccess}
              activeColor={colors.green}
              wrap
            />

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  costHint: {
    backgroundColor: colors.yellowLight,
    borderRadius: 8,
    padding: spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  costHintText: { fontSize: 12, color: '#9b6e00', fontWeight: '600' },
  syncNote: {
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#a5d6a7',
  },
  syncNoteText: { fontSize: 12, color: '#2e7d32', fontWeight: '600' },
});
