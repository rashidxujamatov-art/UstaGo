import Constants from 'expo-constants';

/** Values injected by app.config.ts from mobile/.env. */
interface AppExtra {
  appNameExpansion?: string;
  appDomain?: string;
  operatorName?: string;
  operatorTin?: string;
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

/** Personal-data operator shown in the consent texts (docs/01 §14: not registered yet). */
export function appOperator(): { name: string; tin: string } {
  return { name: extra().operatorName ?? '', tin: extra().operatorTin ?? '' };
}
