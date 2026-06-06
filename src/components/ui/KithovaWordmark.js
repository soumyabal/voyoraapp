/**
 * KithovaWordmark — the ONE canonical wordmark, used wherever "Kithova" appears so the
 * brand reads the same on every surface (splash, header, future share artifacts).
 *
 * One consistent two-tone on EVERY surface: "Kith" (your people) = warm terracotta, "ova" =
 * brand indigo (colors.smart). Indigo is the one neutral-accent that keeps enough contrast on
 * BOTH the cream loader and the dark hero header (a true neutral/ink reads on only one), and it
 * echoes the indigo dot in the app icon — so the wordmark and the mark feel like one family.
 *   onLight (cream) & onDark (hero): Kith = terracotta, ova = indigo
 * (Both variants are identical now; the prop is kept only so existing callers don't change.)
 *
 * Nested <Text> keeps a single text layout pass (kerning + letterSpacing preserved) — do
 * NOT switch to a row of separate <Text>, which breaks kerning/baseline.
 */
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../theme';

const VARIANTS = {
  onLight: { kith: colors.accent, ova: colors.smart },
  onDark:  { kith: colors.accent, ova: colors.smart },
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
