import './intl-polyfills';

import Constants from 'expo-constants';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { usePreferences } from '../store/preferences';
import { appBranding } from '../lib/app-config';
import { DEFAULT_LANGUAGE, LANGUAGES } from './languages';
import { resources } from './resources';

/**
 * i18next setup. Placeholders use single braces (`{shortfall}`) as in
 * docs/01-biznes-qoidalar.md §15. `{appName}` and `{appNameExpansion}` are filled
 * from app.config.ts, so the brand name is never written in the translations.
 */
const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: usePreferences.getState().language,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES,
  initAsync: false,
  returnNull: false,
  interpolation: {
    prefix: '{',
    suffix: '}',
    escapeValue: false, // React already escapes output
    defaultVariables: {
      ...appBranding(),
      version: Constants.expoConfig?.version ?? '',
    },
  },
});

usePreferences.subscribe((state, previous) => {
  if (state.language !== previous.language) void i18n.changeLanguage(state.language);
});

export default i18n;
