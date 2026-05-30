import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme';

/**
 * InfoBanner
 * Coloured notice / tip box used across modals and screens.
 *
 * Props:
 *   icon      string   — emoji shown on the left
 *   title     string
 *   subtitle  string   — optional second line
 *   color     string   — text and border colour (default primary)
 *   bgColor   string   — background colour (default colour + '20')
 *   children  node     — renders below subtitle (for extra content / buttons)
 *   style     object
 */
export default function InfoBanner({ icon, title, subtitle, color, bgColor, children, style }) {
  const c = color || colors.primary;
  const bg = bgColor || c + '18';

  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: c }, style]}>
      <View style={styles.row}>
        {!!icon && <Text style={styles.icon}>{icon}</Text>}
        <View style={styles.textBlock}>
          {!!title && <Text style={[styles.title, { color: c }]}>{title}</Text>}
          {!!subtitle && <Text style={[styles.subtitle, { color: c }]}>{subtitle}</Text>}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { fontSize: 22, marginTop: 1 },
  textBlock: { flex: 1 },
  title: { ...typography.bodyBold, marginBottom: 2 },
  subtitle: { ...typography.small, lineHeight: 19 },
});
