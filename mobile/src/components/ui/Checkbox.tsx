import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  accessibilityLabel: string;
  children: ReactNode;
}

/** Consent checkbox with a rich label (K2, K3b). */
export function Checkbox({ checked, onChange, accessibilityLabel, children }: CheckboxProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!checked)}
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        alignItems: 'flex-start',
        minHeight: theme.size.touchTarget,
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          marginTop: 2,
          borderRadius: 6,
          borderWidth: checked ? 0 : 2,
          borderColor: theme.colors.border,
          backgroundColor: checked ? theme.colors.brand : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Check size={20} color={theme.colors.barText} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}
