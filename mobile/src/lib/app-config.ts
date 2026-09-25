import Constants from 'expo-constants';

/** Values injected by app.config.ts from mobile/.env. */
interface AppExtra {
  appNameExpansion?: string;
  appDomain?: string;
}

function extra(): AppExtra {
  return (Constants.expoConfig?.extra ?? {}) as AppExtra;
}

/** Brand strings for i18n placeholders. The name itself is never hard-coded (CLAUDE.md). */
export function appBranding(): { appName: string; appNameExpansion: string } {
  return {
    appName: Constants.expoConfig?.name ?? '',
    appNameExpansion: extra().appNameExpansion ?? '',
  };
}

export function appDomain(): string {
  return extra().appDomain ?? '';
}
