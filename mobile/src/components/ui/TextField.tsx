import { Eye, EyeOff } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, type TextInputProps, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Fixed part on the left, e.g. "+998". */
  prefix?: string;
  /** Shows an eye button that reveals the text. */
  secret?: boolean;
  right?: ReactNode;
}

/** Labeled input with hint / error text (K2, K3b). */
export function TextField({ label, hint, error, prefix, secret, right, ...input }: TextFieldProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error ? theme.colors.red : focused ? theme.colors.brand : theme.colors.border;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText weight="semibold" color="text2">
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: theme.size.buttonPrimary,
          borderWidth: focused || error ? 2 : 1,
          borderColor,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.bg,
          overflow: 'hidden',
        }}
      >
        {prefix ? (
          <View
            style={{
              alignSelf: 'stretch',
              justifyContent: 'center',
              paddingHorizontal: theme.spacing.lg,
              borderRightWidth: 1,
              borderRightColor: theme.colors.sep,
            }}
          >
            <AppText weight="bold" size="bodyLarge">
              {prefix}
            </AppText>
          </View>
        ) : null}
        <TextInput
          {...input}
          accessibilityLabel={label}
          secureTextEntry={secret && !revealed}
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
            flex: 1,
            // Lets the input shrink so a right-hand button ("Tekshirish") keeps its width.
            minWidth: 0,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            fontFamily: theme.fontFamily.medium,
            fontSize: theme.fontSize.bodyLarge,
            color: theme.colors.text,
          }}
        />
        {secret ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealed ? 'common.hidePassword' : 'common.showPassword')}
            onPress={() => setRevealed((value) => !value)}
            style={{
              padding: theme.spacing.md,
              minWidth: theme.size.touchTarget,
              alignItems: 'center',
            }}
          >
            {revealed ? (
              <EyeOff size={24} color={theme.colors.text2} />
            ) : (
              <Eye size={24} color={theme.colors.text2} />
            )}
          </Pressable>
        ) : null}
        {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
      </View>
      {error ? (
        <AppText size="secondary" color="red">
          {error}
        </AppText>
      ) : hint ? (
        <AppText size="secondary" color="text2">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}
