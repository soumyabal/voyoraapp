import React, { useState } from 'react';
import { Modal, View, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import { colors, spacing } from '../theme';
import { uid, NEEDS_OPTIONS } from '../utils/helpers';
import { ModalHeader, FormField, ChipSelector, InfoBanner } from '../components/ui';

const familyChipOptions = (trip) => trip.families.map(f => ({ value: f.id, label: f.name, _color: f.color }));
const needsOptions = NEEDS_OPTIONS.map(n => ({ value: n, label: n }));

export default function AddTravelerModal({ visible, trip, onClose }) {
  const { addTraveler } = useStore();

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [familyId, setFamilyId] = useState(trip.families[0]?.id || '');
  const [selectedNeeds, setSelectedNeeds] = useState([]);

  const reset = () => {
    setName(''); setAge('');
    setFamilyId(trip.families[0]?.id || '');
    setSelectedNeeds([]);
  };

  const handleClose = () => { reset(); onClose(); };

  const toggleNeed = (need) => {
    setSelectedNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);
  };

  const handleAdd = () => {
    if (!name.trim() || !familyId) return;
    addTraveler(trip.id, familyId, { id: uid(), name: name.trim(), age: parseInt(age) || 0, needs: selectedNeeds });
    handleClose();
  };

  const selectedFamily = trip.families.find(f => f.id === familyId);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title="Add Traveler"
            onClose={handleClose}
            onAction={handleAdd}
            actionDisabled={!name.trim() || !familyId}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {trip.families.length === 0 ? (
              <InfoBanner
                icon="⚠️"
                title="No families yet"
                subtitle="Add a family first, then come back to add travelers."
                color={colors.yellow}
              />
            ) : (
              <ChipSelector
                label="Add to Family *"
                options={familyChipOptions(trip)}
                selected={familyId}
                onSelect={setFamilyId}
                activeColor={selectedFamily?.color || colors.primary}
                wrap
              />
            )}

            <FormField label="Full Name *" value={name} onChangeText={setName} placeholder="e.g. Arjun Sharma" autoCapitalize="words" />
            <FormField label="Age" value={age} onChangeText={setAge} placeholder="e.g. 34" keyboardType="number-pad" />

            <ChipSelector
              label="Special Needs / Accessibility"
              options={needsOptions}
              selected={selectedNeeds}
              onSelect={toggleNeed}
              multi
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
});
