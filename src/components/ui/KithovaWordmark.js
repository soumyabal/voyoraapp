/**
 * KithovaWordmark — the ONE canonical wordmark, used wherever "Kithova" appears so the
 * brand reads the same on every surface (splash, header, future share artifacts).
 *
 * One consistent two-tone everywhere (matches the splash/loader): "Kith" (your people) is the
 * warm terracotta tone, "ova" is ink. Per owner request the header now mirrors the loader
 * exactly rather than flipping "ova" to white on dark.
 *   onLight (cream): Kith = terracotta, ova = ink
 *   onDark  (hero):  Kith = terracotta, ova = ink   ← matches the loader
 * NOTE: ink "ova" on the dark hero is low-contrast; revisit if it reads too faint on device.
 *
 * Nested <Text> keeps a single text layout pass (kerning + letterSpacing preserved) — do
 * NOT switch to a row of separate <Text>, which breaks kerning/baseline.
 */
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../theme';

const VARIANTS = {
  onLight: { kith: colors.accent, ova: colors.ink },
  onDark:  { kith: colors.accent, ova: colors.ink },
};

export default function KithovaWordmark({ variant = 'onLight', size = 32, style }) {
  const v = VARIANTS[variant] || VARIANTS.onLight;
  return (
    <Text
      allowFontScaling={false}
      accessibilityRole="header"
      accessibilityLabel="Kithova"
      style={[{ fontSize: size, fontWeight: '900', letterSpacing: -0.5 }, style]}
    >
      <Text style={{ color: v.kith }}>Kith</Text>
      <Text style={{ color: v.ova }}>ova</Text>
    </Text>
  );
}
