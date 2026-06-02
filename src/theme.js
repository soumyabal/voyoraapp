export const colors = {
  primary: '#e86c3a',
  primaryDark: '#c8532a',
  primaryLight: '#fdf0eb',
  ai: '#6c5ce7',
  aiLight: '#eeecfc',
  expert: '#0984e3',
  expertLight: '#e8f4fd',
  green: '#00b894',
  greenLight: '#e6f9f5',
  red: '#d63031',
  redLight: '#fdecea',
  yellow: '#fdcb6e',
  yellowLight: '#fef9ee',
  bg: '#f7f5f2',
  surface: '#ffffff',
  surface2: '#f0ede8',
  border: '#e4dfd8',
  text: '#1a1714',
  muted: '#7a7067',
  white: '#ffffff',

  // ── Refined-Warm semantic layer (prefer these in new/redesigned UI) ──
  // Brand
  accent:      '#e86c3a',  // primary terracotta — main actions
  accentDark:  '#c8532a',
  accentSoft:  '#fdf0eb',
  accentTint:  '#fbe7dc',  // slightly stronger wash for chips/badges
  // Smart / AI (the ONE secondary accent — replaces stray indigo/blue)
  smart:       '#6c5ce7',
  smartSoft:   '#eeecfc',
  smartDeep:   '#4b3fae',
  // Semantic
  success:     '#0e9f6e', successSoft: '#e3f6ee',
  danger:      '#e23b35', dangerSoft:  '#fdeceb',
  warn:        '#e09a37', warnSoft:    '#fdf3e2',
  // Warm neutrals (refined)
  ink:         '#1c1714', // headings
  body:        '#43382f', // body text
  subtle:      '#8a7d72', // secondary text
  hairline:    '#ece4da', // 1px lines
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

export const typography = {
  display: { fontSize: 32, fontWeight: '900', letterSpacing: -0.8 },
  h1: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  h2: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  h4: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 14, fontWeight: '400' },
  bodyBold: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 12, fontWeight: '400' },
  smallBold: { fontSize: 12, fontWeight: '600' },
  tiny: { fontSize: 11, fontWeight: '400' },
  tinyBold: { fontSize: 11, fontWeight: '600' },
  caption: { fontSize: 11, fontWeight: '400' },
  // Uppercase eyebrow/label used above sections
  overline: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
};

// Activity type colors (left border)
export const activityColors = {
  transport: '#0984e3',
  stay: '#6c5ce7',
  food: '#e17055',
  activity: '#00b894',
  note: '#fdcb6e',
};

export const activityIcons = {
  transport: '🚌',
  stay: '🏨',
  food: '🍽️',
  activity: '🎯',
  note: '📝',
};

// Palette for auto-assigning family colors
export const familyPalette = [
  '#6c5ce7', '#e84393', '#0984e3',
  '#00b894', '#e17055', '#e67e22',
];
