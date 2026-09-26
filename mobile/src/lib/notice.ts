import { Alert, Platform } from 'react-native';

/**
 * One-line message to the user (errors of an action). React Native Web has no Alert,
 * so the developer web preview falls back to the browser dialog.
 */
export function showNotice(message: string): void {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message);
    return;
  }
  Alert.alert(message);
}
