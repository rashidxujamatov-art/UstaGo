import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Pinned below the scrollable content (primary action). */
  footer?: ReactNode;
}

/** Sheet sliding up over a scrim (BJ3, time picker, cancel reasons). Radius 24 (§2.2). */
export function BottomSheet({ visible, onClose, children, footer }: BottomSheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={{ flex: 1, backgroundColor: theme.colors.scrim }}
        />
        <View
          style={{
            maxHeight: '88%',
            borderTopLeftRadius: theme.radius.sheet,
            borderTopRightRadius: theme.radius.sheet,
            backgroundColor: theme.colors.bg,
            paddingBottom: insets.bottom + theme.spacing.lg,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              marginVertical: theme.spacing.md,
              backgroundColor: theme.colors.sep,
            }}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.xl,
              paddingBottom: theme.spacing.lg,
              gap: theme.spacing.lg,
            }}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
