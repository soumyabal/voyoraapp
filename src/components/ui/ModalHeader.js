import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * ModalHeader
 * Standard modal top bar: [closeLabel] [title] [actionLabel]
 *
 * Props:
 *   title        string   — centre label
 *   onClose      fn       — cancel / back handler
 *   onAction     fn       — confirm handler (optional; omit for info-only modals)
 *   actionLabel  string   — default "Add"
 *   actionDisabled bool   — greys out the action button
 *   closeLabel   string   — default "Cancel"
 *   actionColor  string   — default colors.primary
 */
export default function ModalHeader({
  title,
  onClose,
  onAction,
  actionLabel = 'Add',
  actionDisabled = false,
  closeLabel = 'Cancel',
  actionColor,
}) {
  const btnColor = actionColor || colors.primary;

  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
        <Text style={styles.closeText}>{closeLabel}</Text>
      </TouchableOpacity>

      <Text style={styles.title} numberOfLines={1}>{title}</Text>

      {onAction ? (
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: btnColor }, actionDisabled && styles.actionBtnDisabled]}
          onPress={onAction}
          disabled={actionDisabled}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: { minWidth: 64 },
  closeText: { ...typography.body, color: colors.muted },
  title: { ...typography.h4, color: colors.text, flex: 1, textAlign: 'center' },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  actionBtnDisabled: { opacity: 0.35 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  placeholder: { minWidth: 64 },
});
