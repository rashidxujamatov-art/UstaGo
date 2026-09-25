/**
 * Design tokens from docs/03-ekranlar-va-dizayn.md §2. Do not add colors here that are
 * not in the design document; ask for the token first.
 */

const light = {
  bar: '#2461C2',
  barText: '#FFFFFF',
  barText2: '#D9E5F7',
  pillBg: '#FFFFFF',
  pillText: '#1F5BBE',
  bg: '#FFFFFF',
  bg2: '#F0F2F5',
  surface: '#FFFFFF',
  surface2: '#F2F4F7',
  text: '#0F1720',
  text2: '#5B6875',
  sep: '#E3E7EC',
  border: '#8794A1',
  brand: '#2461C2',
  brandText: '#2360C4',
  brandSoft: '#E7EFFC',
  green: '#17743D',
  greenSoft: '#E3F4EA',
  orange: '#A8540C',
  orangeSoft: '#FDF0E1',
  red: '#C6322A',
  redSoft: '#FCE9E7',
  bubbleIn: '#FFFFFF',
  bubbleOut: '#DCEAFD',
  wall: '#DFE7EF',
  scrim: 'rgba(15,23,32,0.45)',
  destinationPin: '#E0483F',
} as const;

/** Every light token must have a dark counterpart and vice versa. */
const dark = {
  bar: '#212E3C',
  barText: '#EEF2F6',
  barText2: '#AAB6C3',
  pillBg: '#2B4A6F',
  pillText: '#CFE3FB',
  bg: '#18222D',
  bg2: '#0F161E',
  surface: '#18222D',
  surface2: '#222F3D',
  text: '#EEF2F6',
  text2: '#93A2B2',
  sep: '#2A3746',
  border: '#5F6E7E',
  brand: '#2F6FCB',
  brandText: '#6AAEF5',
  brandSoft: '#1F3652',
  green: '#4FC37E',
  greenSoft: '#183A2A',
  orange: '#F2A650',
  orangeSoft: '#3D2C17',
  red: '#F2766C',
  redSoft: '#3E2124',
  bubbleIn: '#1E2A37',
  bubbleOut: '#2B5079',
  wall: '#0E151D',
  scrim: 'rgba(0,0,0,0.55)',
  destinationPin: '#E0483F',
} as const satisfies Record<keyof typeof light, string>;

export const palette = { light, dark } as const;

export type ColorScheme = keyof typeof palette;
export type ColorToken = keyof (typeof palette)['light'];
export type Colors = Record<ColorToken, string>;

/** Optional Google Maps styling on top of the provider's own style (§2.1). */
export const mapColors = {
  light: { road: '#FFFFFF', building: '#DAE1E9', park: '#CBE6C9' },
  dark: { road: '#2B3947', building: '#1A2530', route: '#4D8FE8' },
} as const;

/** Golos Text weights. Family names match the keys loaded in app/_layout.tsx. */
export const fontFamily = {
  regular: 'GolosText_400Regular',
  medium: 'GolosText_500Medium',
  semibold: 'GolosText_600SemiBold',
  bold: 'GolosText_700Bold',
} as const;

export type FontWeightName = keyof typeof fontFamily;

/** Base font sizes before the "large text" multiplier (§2.2). */
export const fontSize = {
  caption: 13,
  secondary: 14,
  secondaryLarge: 15,
  body: 16,
  bodyLarge: 17,
  bar: 19,
  barLarge: 20,
  title: 22,
  titleLarge: 24,
  amount: 30,
  amountLarge: 36,
} as const;

export type FontSizeName = keyof typeof fontSize;

/** "Matn o‘lchami: Katta" multiplies every font size by this factor (§2.2). */
export const LARGE_TEXT_SCALE = 1.15;

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  card: 16,
  sheet: 24,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const size = {
  /** Primary button height. */
  buttonPrimary: 56,
  /** Secondary button height range 48–52; 48 is the default. */
  buttonSecondary: 48,
  /** Minimum touch target on both axes. */
  touchTarget: 48,
  /** Header bar height below the status bar. */
  headerBar: 56,
} as const;

/** Brand mark geometry (§2.4). */
export const brandMark = {
  size: 76,
  radius: 24,
  qrSize: 30,
  qrRadius: 8,
  viewBox: 24,
  strokeWidth: 2.4,
  /** The glyph is white in both light and dark mode. */
  glyphColor: '#FFFFFF',
  paths: ['M18.36 5.64A9 9 0 1 0 21 12h-8', 'M15.5 9.5L13 12l2.5 2.5'],
} as const;

/** Brand lettering (§2.4). Not scaled by the "large text" setting. */
export const brandType = {
  /** "GTM" under the icon on the language screen. */
  name: { fontSize: 32, letterSpacing: 1.5 },
  /** "GET THE MONEY", upper case, `brandText` color. */
  expansion: { fontSize: 13, letterSpacing: 2.4 },
  /** Name in the header bar. */
  bar: { fontSize: 21, letterSpacing: 0.5 },
} as const;
