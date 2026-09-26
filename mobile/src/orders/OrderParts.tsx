import type { ReactNode } from 'react';
import { ActivityIndicator, Image, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from '../components/AppText';
import { BarHeader } from '../components/ui/BarHeader';
import { Button } from '../components/ui/Button';
import { useTheme } from '../theme/ThemeProvider';

/** Row of photo thumbnails (order photos, finish photos). */
export function PhotoStrip({ urls }: { urls: string[] }) {
  const theme = useTheme();
  if (urls.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm }}
    >
      {urls.map((url) => (
        <Image
          key={url}
          source={{ uri: url }}
          accessibilityIgnoresInvertColors
          style={{
            width: 96,
            height: 96,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surface2,
          }}
        />
      ))}
    </ScrollView>
  );
}

/** "Ish · Elektr simlarini almashtirish" row of the details card (BY3). */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: theme.spacing.lg, paddingVertical: theme.spacing.sm }}
    >
      <AppText size="bodyLarge" color="text2" style={{ width: 88 }}>
        {label}
      </AppText>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

/** Pinned bottom area with the main action. */
export function Footer({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        borderTopWidth: 1,
        borderTopColor: theme.colors.sep,
        backgroundColor: theme.colors.bg,
      }}
    >
      {children}
    </View>
  );
}

/** Loading and error states of an order screen. */
export function OrderPlaceholder({
  error,
  onRetry,
}: {
  error?: string | null;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg2 }}>
      <BarHeader title="" />
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          padding: theme.spacing.xl,
          gap: theme.spacing.lg,
        }}
      >
        {error ? (
          <>
            <AppText size="bodyLarge" style={{ textAlign: 'center' }}>
              {error}
            </AppText>
            {onRetry ? (
              <Button variant="secondary" title={t('common.retry')} onPress={onRetry} />
            ) : null}
          </>
        ) : (
          <ActivityIndicator color={theme.colors.brand} />
        )}
      </View>
    </View>
  );
}
