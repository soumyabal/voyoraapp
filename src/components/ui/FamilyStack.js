import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme';

/**
 * FamilyStack — overlapping family-colored chips (first initial) with a "+N" overflow.
 * Presentational only; the brand's "who's going" glance, shared by the trip cards and
 * the next-trip spotlight so the treatment is identical everywhere.
 *
 *   families: [{ id, name, color }]   max: how many chips before "+N" (default 4)
 *   size:     chip diameter in px (default 22)
 */
export default function FamilyStack({ families = [], max = 4, size = 22 }) {
  const shown = families.slice(0, max);
  const extra = families.length - shown.length;
  const dim = { width: size, height: size, borderRadius: size / 2 };
  const overlap = -Math.round(size * 0.32);
  return (
    <View style={styles.row}>
      {shown.map((f, i) => (
        <View
          key={f.id || i}
          style={[styles.dot, dim, { backgroundColor: f.color || colors.subtle, marginLeft: i ? overlap : 0, zIndex: shown.length - i }]}
        >
          <Text style={[styles.initial, { fontSize: Math.round(size * 0.45) }]}>{(f.name || '?')[0].toUpperCase()}</Text>
        </View>
      ))}
      {extra > 0 && (
        <View style={[styles.dot, styles.more, dim, { marginLeft: overlap }]}>
          <Text style={[styles.moreText, { fontSize: Math.round(size * 0.4) }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.surface },
  initial: { color: '#fff', fontWeight: '800' },
  more: { backgroundColor: colors.surface2, borderColor: colors.surface },
  moreText: { color: colors.body, fontWeight: '800' },
});
