import { router } from 'expo-router';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface BarHeaderProps {
  title: string;
  subtitle?: string;
  /** Next to the back arrow, e.g. the avatar on BY4. */
  left?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
}

/** Blue header bar with a back arrow and a title (BY2, BY3, BY4, BY6, BJ2). */
export function BarHeader({ title, subtitle, left, right, onBack }: BarHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={{ backgroundColor: theme.colors.bar, paddingTop: insets.top }}>
      <View
        style={{
          minHeight: theme.size.headerBar,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <BarIconButton
          icon={ArrowLeft}
          label={t('common.back')}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')))}
        />
        {left}
        <View style={{ flex: 1 }}>
          <AppText
            size="barLarge"
            weight="bold"
            numberOfLines={1}
            style={{ color: theme.colors.barText }}
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText
              size="secondaryLarge"
              numberOfLines={1}
              style={{ color: theme.colors.barText2 }}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

interface BarIconButtonProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}

/** 48 × 48 icon button on the header bar. */
export function BarIconButton({ icon: Icon, label, onPress }: BarIconButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: theme.size.touchTarget,
        height: theme.size.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={26} color={theme.colors.barText} />
    </Pressable>
  );
}
