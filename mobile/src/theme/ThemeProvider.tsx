import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePreferences } from '../store/preferences';
import {
  type ColorScheme,
  type Colors,
  fontFamily,
  fontSize,
  type FontSizeName,
  LARGE_TEXT_SCALE,
  palette,
  radius,
  size,
  spacing,
} from './tokens';

export interface Theme {
  scheme: ColorScheme;
  colors: Colors;
  /** Font sizes with the "large text" multiplier already applied. */
  fontSize: Record<FontSizeName, number>;
  fontFamily: typeof fontFamily;
  radius: typeof radius;
  spacing: typeof spacing;
  size: typeof size;
}

export function buildTheme(scheme: ColorScheme, textScale: number): Theme {
  const scaled = Object.fromEntries(
    Object.entries(fontSize).map(([name, value]) => [name, Math.round(value * textScale)]),
  ) as Record<FontSizeName, number>;

  return {
    scheme,
    colors: palette[scheme],
    fontSize: scaled,
    fontFamily,
    radius,
    spacing,
    size,
  };
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const themeMode = usePreferences((state) => state.themeMode);
  const textSize = usePreferences((state) => state.textSize);

  const scheme: ColorScheme =
    themeMode === 'auto' ? (systemScheme === 'dark' ? 'dark' : 'light') : themeMode;
  const textScale = textSize === 'large' ? LARGE_TEXT_SCALE : 1;

  const theme = useMemo(() => buildTheme(scheme, textScale), [scheme, textScale]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}
