import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme';

/**
 * FamilyRow
 * A single row showing a family's colour bar, name, subtitle, and an
 * optional right-hand slot (e.g. Switch, chevron, amount text).
 *
 * Props:
 *   family    { id, name, color, members[] }
 *   subtitle  string   — shown below the family name
 *   right     node     — right-slot element (Switch, Text, etc.)
 *   style     object
 *   last      bool     — omits bottom border on last row
 */
export default function FamilyRow({ family, subtitle, right, style, last = false }) {
  return (
    <View style={[styles.row, !last && styles.rowBorder, style]}>
      <View style={[styles.colorBar, { backgroundColor: family.color }]} />
      <View style={styles.info}>
        <Text style={styles.name}>{family.name}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  colorBar: { width: 4, height: 36, borderRadius: 2 },
  info: { flex: 1 },
  name: { ...typography.bodyBold, color: colors.text },
  subtitle: { ...typography.tiny, color: colors.muted, marginTop: 2 },
});
