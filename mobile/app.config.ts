import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The app name, domain and bundle ID are configuration, not code (CLAUDE.md, "Ilova nomi").
 * Expo CLI loads them from mobile/.env; see mobile/.env.example.
 * APP_BUNDLE_ID cannot change after the first store release.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set. Copy mobile/.env.example to mobile/.env and fill it in.`);
  }
  return value;
}

const BUNDLE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export default ({ config }: ConfigContext): ExpoConfig => {
  const appName = required('APP_NAME');
  const bundleId = required('APP_BUNDLE_ID');
  if (!BUNDLE_ID.test(bundleId)) {
    throw new Error(`APP_BUNDLE_ID "${bundleId}" is not a valid Android package / iOS bundle ID.`);
  }
  const easProjectId = process.env.EAS_PROJECT_ID?.trim();

  return {
    ...config,
    name: appName,
    slug: required('APP_SLUG'),
    version: '1.0.0',
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    scheme: bundleId,
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: bundleId,
      supportsTablet: false,
    },
    android: {
      package: bundleId,
    },
    plugins: [
      'expo-router',
      'expo-localization',
      // Same value as palette.light.brand (src/theme/tokens.ts); app config cannot import TS modules.
      ['expo-splash-screen', { backgroundColor: '#2461C2' }],
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      appNameExpansion: required('APP_NAME_EXPANSION'),
      appDomain: required('APP_DOMAIN'),
      // Legal entity and tax number for consent texts; placeholders until registered (§14).
      operatorName: process.env.APP_OPERATOR_NAME?.trim() || '[MChJ nomi]',
      operatorTin: process.env.APP_OPERATOR_TIN?.trim() || '[raqam]',
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
};
