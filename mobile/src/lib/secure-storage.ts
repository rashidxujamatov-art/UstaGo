import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Secrets on the device (refresh token, device id): Keychain / Keystore via SecureStore.
 * The web build exists only as a developer preview; there it falls back to localStorage.
 */
export const secureStorage = {
  getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web')
      return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
    return SecureStore.getItemAsync(key);
  },
  setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
  deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.removeItem(key);
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};
