import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { type Language, pickLanguage } from '../i18n/languages';

/** Appearance chosen by the user: follow the system ("auto") or force light/dark (Main, U3). */
export type ThemeMode = 'light' | 'dark' | 'auto';
export type TextSize = 'normal' | 'large';

interface PreferencesState {
  language: Language;
  themeMode: ThemeMode;
  textSize: TextSize;
  /** The language screen (Main) was passed at least once. */
  welcomed: boolean;
  setLanguage: (language: Language) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setTextSize: (size: TextSize) => void;
  setWelcomed: () => void;
}

/**
 * Device preferences, kept across launches. After sign-in they are copied to the
 * account (`PATCH /me`) so the backend knows the SMS language.
 */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      language: pickLanguage(getLocales().map((locale) => locale.languageCode)),
      themeMode: 'auto',
      textSize: 'normal',
      welcomed: false,
      setLanguage: (language) => set({ language }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setTextSize: (textSize) => set({ textSize }),
      setWelcomed: () => set({ welcomed: true }),
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, themeMode, textSize, welcomed }) => ({
        language,
        themeMode,
        textSize,
        welcomed,
      }),
    },
  ),
);

export const themeToApi = (mode: ThemeMode) => mode.toUpperCase() as 'LIGHT' | 'DARK' | 'AUTO';
