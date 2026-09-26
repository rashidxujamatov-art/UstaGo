import { useRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../AppText';

interface OtpInputProps {
  length: number;
  value: string;
  onChange: (code: string) => void;
  error?: boolean;
  accessibilityLabel: string;
}

/**
 * K3 code boxes. One hidden input receives the digits, so SMS autofill
 * (iOS one-time-code, Android sms-otp) and pasting work.
 */
export function OtpInput({ length, value, onChange, error, accessibilityLabel }: OtpInputProps) {
  const theme = useTheme();
  const input = useRef<TextInput>(null);

  return (
    <Pressable onPress={() => input.current?.focus()} accessible={false}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'center' }}>
        {Array.from({ length }, (_, index) => {
          const active = index === Math.min(value.length, length - 1);
          return (
            <View
              key={index}
              style={{
                flex: 1,
                maxWidth: 56,
                aspectRatio: 0.85,
                borderRadius: theme.radius.md,
                borderWidth: active ? 2 : 1,
                borderColor: error
                  ? theme.colors.red
                  : active
                    ? theme.colors.brand
                    : theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.bg,
              }}
            >
              <AppText weight="bold" size="title">
                {value[index] ?? ''}
              </AppText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        accessibilityLabel={accessibilityLabel}
        caretHidden
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
    </Pressable>
  );
}
