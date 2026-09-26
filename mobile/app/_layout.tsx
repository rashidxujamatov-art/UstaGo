import '../src/i18n';

// Per-weight imports so unused weights (800, 900) are not bundled.
import { GolosText_400Regular } from '@expo-google-fonts/golos-text/400Regular';
import { GolosText_500Medium } from '@expo-google-fonts/golos-text/500Medium';
import { GolosText_600SemiBold } from '@expo-google-fonts/golos-text/600SemiBold';
import { GolosText_700Bold } from '@expo-google-fonts/golos-text/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useSyncExternalStore } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { bootstrapSession } from '../src/auth/session-actions';
import { usePreferences } from '../src/store/preferences';
import { useSession } from '../src/store/session';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();

/** True once the saved preferences are loaded; no race with the subscription. */
function usePreferencesHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => usePreferences.persist.onFinishHydration(onChange),
    () => usePreferences.persist.hasHydrated(),
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

export default function RootLayout() {
  // Keys must match fontFamily in src/theme/tokens.ts.
  const [fontsLoaded, fontError] = useFonts({
    GolosText_400Regular,
    GolosText_500Medium,
    GolosText_600SemiBold,
    GolosText_700Bold,
  });
  const prefsReady = usePreferencesHydrated();
  const sessionStatus = useSession((state) => state.status);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  const ready = (fontsLoaded || fontError !== null) && prefsReady && sessionStatus !== 'loading';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Navigation />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Screen groups are guarded by the session (Stack.Protected): signed-out screens,
 * onboarding until MyID and role are done, then the app. `index` routes to the right one.
 */
function Navigation() {
  const theme = useTheme();
  const status = useSession((state) => state.status);
  const step = useSession((state) => state.user?.onboarding_step);
  const signedIn = status === 'signedIn';

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.bg2);
  }, [theme.colors.bg2]);

  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="r/[code]" />
        <Stack.Protected guard={status === 'offline'}>
          <Stack.Screen name="offline" />
        </Stack.Protected>
        <Stack.Protected guard={status === 'signedOut'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && step !== 'DONE'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && step === 'DONE'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
