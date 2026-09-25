import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { type Language, pickLanguage } from '../i18n/languages';

/** Appearance chosen by the user: follow the system ("auto") or force light/dark (U3). */
export type ThemeMode = 'light' | 'dark' | 'auto';
export type TextSize = 'normal' | 'large';

interface PreferencesState {
  language: Language;
  themeMode: ThemeMode;
  textSize: TextSize;
  setLanguage: (language: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setTextSize: (size: TextSize) => void;
}

/**
 * Device-level preferences. Persistence and sync with the profile (`PATCH /me`)
 * come with the auth stage.
 */
export const usePreferences = create<PreferencesState>()((set) => ({
  language: pickLanguage(getLocales().map((locale) => locale.languageCode)),
  themeMode: 'auto',
  textSize: 'normal',
  setLanguage: (language) => set({ language }),
  setThemeMode: (themeMode) => set({ themeMode }),
  setTextSize: (textSize) => set({ textSize }),
}));
