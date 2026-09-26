import { Stack } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function GroupLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  );
}
