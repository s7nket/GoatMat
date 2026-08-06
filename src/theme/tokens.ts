/**
 * GoatMat design tokens.
 *
 * Every colour, size and shadow in the app comes from this file. Nothing is
 * hard-coded in a screen. That is the whole reason the app looks consistent.
 *
 * Light mode only for now -- a half-finished dark mode looks worse than none.
 * The shape below is ready for it: add a `dark` object and swap at the root.
 */

import { Platform, type TextStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Palette -- raw values. Screens should use `colors` below, not these.
// ---------------------------------------------------------------------------
const palette = {
  // Brand: a grounded agricultural green. Confident, not neon.
  green900: '#0A3D26',
  green700: '#0F5C39',
  green600: '#137A4C',
  green500: '#1A9A60',
  green100: '#DCF3E7',
  green50: '#F1FAF5',

  // Neutrals: slightly cool grey. Reads as "software", not "spreadsheet".
  slate900: '#0F1720',
  slate800: '#1C2733',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748B',
  slate400: '#94A3B8',
  slate300: '#CBD5E1',
  slate200: '#E2E8F0',
  slate100: '#F1F5F9',
  slate50: '#F8FAFC',
  white: '#FFFFFF',

  red600: '#DC2626',
  red100: '#FEE2E2',
  amber600: '#D97706',
  amber100: '#FEF3C7',
  blue600: '#2563EB',
  blue100: '#DBEAFE',
} as const;

// ---------------------------------------------------------------------------
// Semantic colours -- what a thing *means*, not what it looks like.
// ---------------------------------------------------------------------------
export const colors = {
  // surfaces
  background: palette.slate50,
  surface: palette.white,
  surfaceSunken: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate300,

  // text
  text: palette.slate900,
  textSecondary: palette.slate600,
  textMuted: palette.slate400,
  textInverse: palette.white,

  // brand
  primary: palette.green600,
  primaryPressed: palette.green700,
  primaryDark: palette.green900,
  primarySoft: palette.green100,
  primarySofter: palette.green50,

  // money direction -- used everywhere, so it gets first-class names
  moneyIn: palette.green600,
  moneyInSoft: palette.green100,
  moneyOut: palette.red600,
  moneyOutSoft: palette.red100,

  // status
  danger: palette.red600,
  dangerSoft: palette.red100,
  warning: palette.amber600,
  warningSoft: palette.amber100,
  info: palette.blue600,
  infoSoft: palette.blue100,

  overlay: 'rgba(15, 23, 32, 0.45)',
} as const;

// ---------------------------------------------------------------------------
// Spacing -- 4pt grid. Use the names, never a raw number.
// ---------------------------------------------------------------------------
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

// ---------------------------------------------------------------------------
// Typography -- Inter, loaded in the root layout.
// `tabular` is critical: money columns must not jitter as digits change.
// ---------------------------------------------------------------------------
export const fontFamily = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  display: { fontFamily: fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.5 },
  title: { fontFamily: fontFamily.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontFamily: fontFamily.semibold, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 21 },
  bodyMedium: { fontFamily: fontFamily.medium, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: fontFamily.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16 },
  overline: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // Money. `tabular-nums` keeps digits the same width so amounts in a column
  // do not shift sideways as the numbers change.
  amount: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
  },
  amountLarge: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  // `satisfies` rather than `as const`: keeps the keys literal for the Variant
  // union while letting RN's own style types apply to the values.
} satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Elevation -- restrained. Two levels only, so cards do not fight each other.
// ---------------------------------------------------------------------------
export const shadow = {
  card: Platform.select({
    android: { elevation: 1 },
    default: {
      shadowColor: palette.slate900,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
  })!,
  raised: Platform.select({
    android: { elevation: 6 },
    default: {
      shadowColor: palette.slate900,
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
  })!,
} as const;

/** Minimum touch target. Below this, thumbs miss. */
export const HIT_SIZE = 44;
