import type { ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface CardProps {
  children: ReactNode;
  /** Blue section title, e.g. "Buyurtma holati", "Hisob-kitob". */
  title?: string;
  style?: StyleProp<ViewStyle>;
}

/** Rounded surface block on the `bg2` screen background (radius 16). */
export function Card({ children, title, style }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          padding: theme.spacing.lg + 2,
          gap: theme.spacing.md,
          borderRadius: theme.radius.card,
          backgroundColor: theme.colors.surface,
        },
        style,
      ]}
    >
      {title ? (
        <AppText size="bodyLarge" weight="bold" color="brandText" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

/** Thin line between rows inside a card. */
export function Separator({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return <View style={{ height: 1, marginLeft: inset, backgroundColor: theme.colors.sep }} />;
}
