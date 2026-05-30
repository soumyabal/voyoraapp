import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, familyPalette } from '../theme';
import { uid } from '../utils/helpers';
import { ModalHeader, FormField, InfoBanner } from '../components/ui';

const ColorSwatch = ({ color, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.swatch, { backgroundColor: color }, selected && styles.swatchActive]}
    onPress={onPress}
  >
    {selected && <Text style={styles.swatchCheck}>✓</Text>}
  </TouchableOpacity>
);

export default function AddFamilyModal({ visible, trip, onClose }) {
  const { addFamily } = useStore();

  const usedColors = trip.families.map(f => f.color);
  const defaultColor = familyPalette.find(c => !usedColors.includes(c)) || familyPalette[0];

  const [name, setName] = useState('');
  const [color, setColor] = useState(defaultColor);

  const reset = () => {
    setName('');
    const used = trip.families.map(f => f.color);
    setColor(familyPalette.find(c => !used.includes(c)) || familyPalette[0]);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAdd = () => {
    if (!name.trim()) return;
    addFamily(trip.id, { id: uid(), name: name.trim(), color, members: [] });
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.container}>
          <ModalHeader
            title="Add Family"
            onClose={handleClose}
            onAction={handleAdd}
            actionDisabled={!name.trim()}
          />

          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* Live preview */}
            <View style={[styles.preview, { borderLeftColor: color }]}>
              <Text style={[styles.previewName, { color }]}>👨‍👩‍👧 {name || 'Family Name'}</Text>
              <Text style={styles.previewSub}>0 travelers</Text>
            </View>

            <FormField
              label="Family Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. The Sharmas"
              autoFocus
            />

            <Text style={styles.label}>Family Color</Text>
            <View style={styles.colorGrid}>
              {familyPalette.map(c => (
                <ColorSwatch key={c} color={c} selected={color === c} onPress={() => setColor(c)} />
              ))}
            </View>

            <InfoBanner
              icon="💡"
              title="Next step"
              subtitle='After adding the family, use the "+ Traveler" button to add members.'
              color={colors.primary}
              style={{ marginTop: spacing.xl }}
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
  preview: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 4, borderRadius: radius.lg, padding: spacing.xl, marginBottom: spacing.xl },
  previewName: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  previewSub: { fontSize: 12, color: colors.muted },
  label: { fontSize: 11, fontWeight: '700', color: colors.text, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.lg },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  swatchActive: { borderWidth: 3, borderColor: colors.text },
  swatchCheck: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
