/**
 * shellTheme.js — a LOCAL light/dark palette for the flag-gated new shell ONLY.
 *
 * The main app is light-only (src/theme.js, `userInterfaceStyle: light`); this does NOT touch it.
 * Only the four new-shell screens (MainShell · Discover · Updates · Profile) consume `useShellTheme`,
 * and only when RELEASE_FLAGS.newShell is on. Dark values are ported from the prototype's `:root`
 * (the default dark exploration) in prototypes/discover-rails.html; light = the existing theme tokens.
 *
 * Pattern: a screen does `const { c } = useShellTheme()` then builds `makeStyles(c)`. The hook returns
 * a LIGHT fallback when no provider is mounted, so a screen rendered bare (e.g. the compile-net) is safe.
 */
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { colors as light } from './theme';

// The 10 tokens the new-shell screens use, in dark. Spread over `light` so any OTHER token a screen
// references still resolves (to its light value) — no missing-color crashes.
const DARK = {
  bg:           '#0a0a0c',
  surface:      '#17171c',
  hairline:     'rgba(255,255,255,0.10)',
  text:         '#ffffff',
  muted:        'rgba(255,255,255,0.62)',
  subtle:       'rgba(255,255,255,0.42)',
  accent:       '#e86c3a',                 // prototype keeps terracotta identical in both modes
  primaryLight: 'rgba(232,108,58,0.20)',   // active-tab ring / soft terracotta wash
  smartDeep:    '#b9aef7',                  // light lavender text on dark
  smartSoft:    'rgba(139,123,240,0.20)',   // soft indigo wash
};

const LIGHT_PALETTE = light;
const DARK_PALETTE = { ...light, ...DARK };

const Ctx = createContext(null);

export function ShellThemeProvider({ children }) {
  const sys = useColorScheme();                 // 'light' | 'dark' | null
  const [mode, setMode] = useState('system');   // 'system' | 'light' | 'dark'
  const resolved = mode === 'system' ? (sys === 'dark' ? 'dark' : 'light') : mode;
  const c = resolved === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  const value = useMemo(() => ({ c, mode, setMode, resolved }), [c, mode, resolved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Safe default: no provider → light. Lets a screen render standalone without crashing.
export function useShellTheme() {
  return useContext(Ctx) || { c: LIGHT_PALETTE, mode: 'system', setMode: () => {}, resolved: 'light' };
}
