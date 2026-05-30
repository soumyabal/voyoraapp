import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * ChipSelector
 * Horizontal scrollable row of selectable chips.
 * Supports single-select and multi-select modes.
 *
 * Props:
 *   options       [{value, label, icon?}]
 *   selected      string | string[]   — selected value(s)
 *   onSelect      fn(value)           — called with the tapped value
 *   multi         bool                — allow multiple selections
 *   activeColor   string              — highlight colour (default primary)
 *   activeBg      string              — highlight bg (default primaryLight)
 *   wrap          bool                — wrap instead of horizontal scroll
 *   label         string              — optional section label above chips
 *   containerStyle object
 */
export default function ChipSelector({
  options = [],
  selected,
  onSelect,
  multi = false,
  activeColor = colors.primary,
  activeBg,
  wrap = false,
  label,
  containerStyle,
}) {
  const bg = activeBg || activeColor + '20';

  const isSelected = (value) =>
    multi ? (Array.isArray(selected) && selected.includes(value)) : selected === value;

  const chips = options.map(opt => {
    const active = isSelected(opt.value);
    return (
      <TouchableOpacity
        key={opt.value}
        style={[styles.chip, active && { borderColor: activeColor, backgroundColor: bg }]}
        onPress={() => onSelect(opt.value)}
        activeOpacity={0.75}
      >
        {!!opt.icon && <Text style={styles.chipIcon}>{opt.icon}</Text>}
        <Text style={[styles.chipLabel, active && { color: activeColor, fontWeight: '700' }]}>
          {opt.label}
        </Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={[styles.container, containerStyle]}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      {wrap ? (
        <View style={styles.wrapRow}>{chips}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.scrollRow}>{chips}</View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: {
    ...typography.smallBold,
    color: colors.text,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 11,
  },
  scrollRow: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipIcon: { fontSize: 15 },
  chipLabel: { ...typography.small, color: colors.muted },
});
