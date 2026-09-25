import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

interface ScreenProps {
  children: ReactNode;
  /** Pinned to the bottom (primary action). */
  footer?: ReactNode;
  header?: ReactNode;
}

/** Full-screen layout for the sign-up steps: scrollable body, fixed bottom action. */
export function Screen({ children, footer, header }: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {header ? <View style={{ paddingHorizontal: theme.spacing.xxl }}>{header}</View> : null}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: theme.spacing.xxl,
            paddingVertical: theme.spacing.lg,
            gap: theme.spacing.xl,
          }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.xxl,
              paddingBottom: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
