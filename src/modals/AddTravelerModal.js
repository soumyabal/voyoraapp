import React, { useState } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography, shadow } from '../theme';
import { uid, NEEDS_OPTIONS, INTERESTS_OPTIONS } from '../utils/helpers';
import { ModalHeader, FormField, ChipSelector, InfoBanner } from '../components/ui';

const familyChipOptions = (trip) => trip.families.map(f => ({ value: f.id, label: f.name, _color: f.color }));
const needsOptions     = NEEDS_OPTIONS.map(n => ({ value: n, label: n }));
const interestsOptions = INTERESTS_OPTIONS.map(n => ({ value: n, label: n }));

export default function AddTravelerModal({ visible, trip, defaultFamId, onClose }) {
  const { addTraveler, travelers, createTraveler } = useStore();

  const [name, setName]             = useState('');
  const [age, setAge]               = useState('');
  const [familyId, setFamilyId]     = useState(defaultFamId || trip.families[0]?.id || '');
  const [selectedNeeds,     setSelectedNeeds]     = useState([]);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [saveToLibrary,     setSaveToLibrary]     = useState(false);

  React.useEffect(() => {
    if (visible) {
      setFamilyId(defaultFamId || trip.families[0]?.id || '');
      setName(''); setAge(''); setSelectedNeeds([]); setSelectedInterests([]); setSaveToLibrary(false);
    }
  }, [visible, defaultFamId]);

  const toggleNeed     = (need)     => setSelectedNeeds(prev     => prev.includes(need)     ? prev.filter(n => n !== need)     : [...prev, need]);
  const toggleInterest = (interest) => setSelectedInterests(prev => prev.includes(interest) ? prev.filter(n => n !== interest) : [...prev, interest]);

  // Add from library — one tap adds the traveler as a trip member
  const handleAddFromLibrary = (tv) => {
    const famId = familyId || trip.families[0]?.id;
    if (!famId) return;
    addTraveler(trip.id, famId, {
      id: uid(),
      travelerId: tv.id,
      name: tv.name,
      age: tv.age || 0,
      needs: [...(tv.needs || [])],
    });
    onClose();
  };

  const handleAdd = () => {
    if (!name.trim() || !familyId) return;
    const tvId = saveToLibrary ? uid() : null;
    const member = {
      id: uid(),
      name: name.trim(),
      age: parseInt(age) || 0,
      needs: selectedNeeds,
      travelerId: tvId,
    };
    addTraveler(trip.id, familyId, member);
    if (saveToLibrary) {
      createTraveler({
        id: tvId,
        name: name.trim(),
        age: parseInt(age) || null,
        emoji: '👤',
        dietary: [],
        needs: selectedNeeds,
        interests: selectedInterests,
        pacePreference: 'moderate',
        notes: '',
      });
    }
    onClose();
  };

  const selectedFamily = trip.families.find(f => f.id === familyId);
  const canAdd = name.trim() && familyId;

  // Travelers already in this trip (to avoid duplicate suggestions)
  const memberTravelerIds = new Set(
    trip.families.flatMap(f => f.members.map(m => m.travelerId)).filter(Boolean)
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.container}>
          <ModalHeader
            title="Add Traveler"
            onClose={onClose}
            onAction={handleAdd}
            actionDisabled={!canAdd}
          />

          <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

            {/* ── Family selector ─────────────────────────────── */}
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

            {/* ── Pick from Library ───────────────────────────── */}
            {travelers.length > 0 && (
              <View style={s.libSection}>
                <Text style={s.sectionLabel}>From Library</Text>
                <Text style={s.sectionHint}>Tap a traveler to add them instantly</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.libScroll}>
                  <View style={s.libRow}>
                    {travelers.map(tv => {
                      const alreadyAdded = memberTravelerIds.has(tv.id);
                      return (
                        <TouchableOpacity
                          key={tv.id}
                          style={[s.profileChip, alreadyAdded && s.profileChipAdded]}
                          onPress={() => !alreadyAdded && handleAddFromLibrary(tv)}
                          disabled={alreadyAdded}
                          activeOpacity={0.7}
                        >
                          <Text style={s.profileEmoji}>{tv.emoji || '👤'}</Text>
                          <Text style={[s.profileName, alreadyAdded && s.profileNameAdded]} numberOfLines={1}>
                            {tv.name.split(' ')[0]}
                          </Text>
                          {tv.age ? <Text style={s.profileAge}>{tv.age}yo</Text> : null}
                          {alreadyAdded && <Text style={s.addedTag}>✓ added</Text>}
                          {(tv.needs || []).length > 0 && !alreadyAdded && (
                            <Text style={s.profileNeeds} numberOfLines={1}>
                              {tv.needs.slice(0, 2).join(' · ')}
                            </Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* ── Divider ─────────────────────────────────────── */}
            <View style={s.dividerRow}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>{travelers.length > 0 ? 'or add new' : 'New traveler'}</Text>
              <View style={s.dividerLine} />
            </View>

            {/* ── New traveler form ────────────────────────────── */}
            <FormField
              label="Full Name *"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Arjun Sharma"
              autoCapitalize="words"
            />
            <FormField
              label="Age"
              value={age}
              onChangeText={setAge}
              placeholder="e.g. 34"
              keyboardType="number-pad"
            />
            <ChipSelector
              label="Special Needs / Accessibility"
              options={needsOptions}
              selected={selectedNeeds}
              onSelect={toggleNeed}
              multi
              activeColor={colors.green}
              wrap
            />
            <ChipSelector
              label="Interests"
              options={interestsOptions}
              selected={selectedInterests}
              onSelect={toggleInterest}
              multi
              activeColor={colors.primary}
              wrap
            />

            {/* ── Save to Library toggle ───────────────────────── */}
            {name.trim().length > 0 && (
              <View style={s.toggleRow}>
                <View style={s.toggleInfo}>
                  <Text style={s.toggleLabel}>Save to Traveler Library</Text>
                  <Text style={s.toggleHint}>Reuse this traveler across future trips</Text>
                </View>
                <Switch
                  value={saveToLibrary}
                  onValueChange={setSaveToLibrary}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            )}

          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.xxl, paddingBottom: 80 },

  // Library section
  libSection: { marginBottom: spacing.xl },
  sectionLabel: {
    ...typography.caption,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sectionHint: { ...typography.caption, color: colors.muted, marginBottom: spacing.md },
  libScroll: { marginHorizontal: -spacing.xxl },
  libRow: { flexDirection: 'row', paddingHorizontal: spacing.xxl, gap: spacing.md, paddingBottom: 4 },

  profileChip: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    minWidth: 80,
    maxWidth: 100,
    borderWidth: 1.5,
    borderColor: colors.primary,
    ...shadow.sm,
  },
  profileChipAdded: {
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  profileEmoji: { fontSize: 24, marginBottom: 4 },
  profileName: { ...typography.caption, fontWeight: '800', color: colors.text, textAlign: 'center' },
  profileNameAdded: { color: colors.muted },
  profileAge: { ...typography.caption, color: colors.muted, fontSize: 10, marginTop: 1 },
  profileNeeds: { ...typography.caption, color: colors.muted, fontSize: 9, marginTop: 2, textAlign: 'center' },
  addedTag: { ...typography.caption, color: colors.green, fontWeight: '700', fontSize: 10, marginTop: 2 },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { ...typography.caption, color: colors.muted, fontWeight: '700' },

  // Save to library toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleInfo: { flex: 1, marginRight: spacing.md },
  toggleLabel: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  toggleHint: { ...typography.caption, color: colors.muted, marginTop: 1 },
});
