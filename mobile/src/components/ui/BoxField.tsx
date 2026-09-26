import { type ReactNode, useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import type { FontSizeName, FontWeightName } from '../../theme/tokens';
import { AppText } from '../AppText';

export interface BoxFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  /** Fixed text on the right, e.g. "so‘m". */
  suffix?: ReactNode;
  valueSize?: FontSizeName;
  valueWeight?: FontWeightName;
  /** Share a row equally with its neighbours (BY6: entrance, floor, flat). */
  grow?: boolean;
}

/** Outlined input with the label inside the border (BY2, BY6). */
export function BoxField({
  label,
  error,
  suffix,
  valueSize = 'bodyLarge',
  valueWeight = 'medium',
  grow = false,
  ...input
}: BoxFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ gap: theme.spacing.xs }, grow ? { flex: 1 } : null]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.size.buttonPrimary,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          borderWidth: focused || error ? 2 : 1,
          borderColor: error
            ? theme.colors.red
            : focused
              ? theme.colors.brand
              : theme.colors.border,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.bg,
        }}
      >
        <View style={{ flex: 1 }}>
          <AppText size="secondary" color="text2">
            {label}
          </AppText>
          <TextInput
            {...input}
            accessibilityLabel={label}
            placeholderTextColor={theme.colors.text2}
            onFocus={(event) => {
              setFocused(true);
              input.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              input.onBlur?.(event);
            }}
            style={{
              minWidth: 0,
              minHeight: input.multiline ? 52 : undefined,
              paddingVertical: 2,
              fontFamily: theme.fontFamily[valueWeight],
              fontSize: theme.fontSize[valueSize],
              color: theme.colors.text,
              textAlignVertical: input.multiline ? 'top' : 'center',
            }}
          />
        </View>
        {suffix}
      </View>
      {error ? (
        <AppText size="secondary" color="red">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
