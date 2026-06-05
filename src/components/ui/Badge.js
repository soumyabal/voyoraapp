import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme';

/**
 * Badge
 * Small coloured pill — need tags, cost labels, access flags.
 *
 * Props:
 *   label      string
 *   color      string   — text colour (default colors.text)
 *   bgColor    string   — background (default colors.surface2)
 *   borderColor string  — border (default transparent)
 *   style      object
 */
export default function Badge({ label, color, bgColor, borderColor, style }) {
  return (
    <View style={[
      styles.badge,
      { backgroundColor: bgColor || colors.surface2, borderColor: borderColor || 'transparent' },
      style,
    ]}>
      <Text style={[styles.label, { color: color || colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 11, fontWeight: '700' },
});
