import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * EmptyState
 * Centred placeholder for empty lists / screens.
 *
 * Props:
 *   icon         string   — emoji
 *   title        string
 *   subtitle     string   — optional
 *   buttonLabel  string   — optional; omit to hide button
 *   onPress      fn       — required when buttonLabel is set
 *   style        object
 */
export default function EmptyState({ icon, title, subtitle, buttonLabel, onPress, style }) {
  return (
    <View style={[styles.container, style]}>
      {!!icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!buttonLabel && (
        <TouchableOpacity style={styles.btn} onPress={onPress}>
          <Text style={styles.btnText}>{buttonLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: spacing.xxl,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { ...typography.h4, color: colors.muted, marginBottom: 8, textAlign: 'center' },
  subtitle: { ...typography.small, color: colors.muted, textAlign: 'center', marginBottom: 16 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  btnText: { color: '#fff', fontWeight: '700' },
});
