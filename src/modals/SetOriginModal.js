/**
 * SetOriginModal.js
 *
 * Lightweight sheet to set/edit/clear a trip's STARTING POINT — where Day 1
 * begins (arrival airport, hotel, or home). Stored as trip.origin = {label,lat,lng}.
 * The Day-1 origin chip + first-stop travel leg are derived from it.
 *
 * Deliberately NOT the full Edit Trip flow: no date/destination destructive guard,
 * just the one field. Reuses the free Photon location search (coords come along).
 */

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import useStore, { showToast } from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { ModalHeader, LocationSearchField } from '../components/ui';

export default function SetOriginModal({ visible, trip, onClose }) {
  const { updateTrip } = useStore();
  const [origin, setOrigin] = useState(null);   // { label, lat, lng } | null

  useEffect(() => {
    if (visible) setOrigin(trip?.origin || null);
  }, [visible, trip]);

  const save = () => {
    updateTrip(trip.id, { origin: origin && origin.label ? origin : null });
    showToast(origin?.label ? 'Starting point set 📍' : 'Starting point cleared', '✅');
    onClose();
  };

  const remove = () => {
    updateTrip(trip.id, { origin: null });
    showToast('Starting point cleared', '✅');
    onClose();
  };

  const hasCoords = origin?.lat != null && origin?.lng != null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <ModalHeader
          title="Starting Point"
          closeLabel="Cancel"
          actionLabel="Save"
          onClose={onClose}
          onAction={save}
          actionColor={colors.green}
        />
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.intro}>
            Where does Day 1 begin? Set your arrival airport, hotel, or home and the
            first stop will show its drive time — and auto-arrange will route from there.
          </Text>

          <LocationSearchField
            label="Starting Point"
            value={origin?.label || ''}
            onSelect={(label, coords) => setOrigin(label ? { label, lat: coords?.lat ?? null, lng: coords?.lng ?? null } : null)}
            placeholder="e.g. O'Hare Airport, or 123 Home St"
          />

          {origin?.label && !hasCoords && (
            <Text style={s.warn}>⚠️ Pick a result from the list so we can place it on the map — typed-only text has no location.</Text>
          )}
          {hasCoords && (
            <Text style={s.ok}>📍 Located — Day 1&apos;s first stop will show its travel time from here.</Text>
          )}

          {!!trip?.origin && (
            <TouchableOpacity style={s.removeBtn} onPress={remove} activeOpacity={0.85}>
              <Text style={s.removeText}>Remove starting point</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  intro: { ...typography.small, color: colors.muted, lineHeight: 19, marginBottom: spacing.lg },
  warn: { ...typography.caption, color: colors.warn, marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
  ok: { ...typography.caption, color: colors.success, fontWeight: '600', marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 16 },
  removeBtn: { marginTop: spacing.lg, alignSelf: 'flex-start', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  removeText: { ...typography.smallBold, color: colors.danger },
});
