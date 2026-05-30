import React, { useState } from 'react';
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

export default function AddActivityModal({ visible, trip, currentDay, onClose }) {
  const { addActivity } = useStore();

  const [name, setName] = useState('');
  const [type, setType] = useState('activity');
  const [time, setTime] = useState('09:00');
  const [detail, setDetail] = useState('');
  const [costPerPerson, setCostPerPerson] = useState('');
  const [access, setAccess] = useState('');

  const reset = () => {
    setName(''); setType('activity'); setTime('09:00');
    setDetail(''); setCostPerPerson(''); setAccess('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAdd = () => {
    if (!name.trim()) return;
    addActivity(trip.id, currentDay, {
      id: uid(), name: name.trim(), type, time,
      detail: detail.trim(),
      costPerPerson: parseFloat(costPerPerson) || 0,
      access,
    });
    handleClose();
  };

  const totalMembers = trip.families.reduce((s, f) => s + f.members.length, 0);
  const totalCost = parseFloat(costPerPerson) > 0
    ? (parseFloat(costPerPerson) * totalMembers).toFixed(2)
    : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title="Add Activity"
            onClose={handleClose}
            onAction={handleAdd}
            actionDisabled={!name.trim()}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            <ChipSelector label="Type" options={activityOptions} selected={type} onSelect={setType} />

            <FormField label="Activity Name *" value={name} onChangeText={setName} placeholder="e.g. Snorkeling at Blue Lagoon" />
            <FormField label="Time" value={time} onChangeText={setTime} placeholder="09:00" keyboardType="numeric" />
            <FormField label="Details (optional)" value={detail} onChangeText={setDetail} placeholder="Notes, booking refs, meeting points…" multiline />
            <FormField label="Cost per Person ($)" value={costPerPerson} onChangeText={setCostPerPerson} placeholder="0" keyboardType="decimal-pad" />

            {!!totalCost && (
              <View style={styles.costHint}>
                <Text style={styles.costHintText}>📊 {totalMembers} travelers · estimated total ${totalCost}</Text>
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
  costHint: { backgroundColor: colors.yellowLight, borderRadius: 8, padding: spacing.md, marginTop: -spacing.md, marginBottom: spacing.lg },
  costHintText: { fontSize: 12, color: '#9b6e00', fontWeight: '600' },
});
