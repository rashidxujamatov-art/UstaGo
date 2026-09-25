import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { DeviceInfo } from '../api/types';

const DEVICE_ID_KEY = 'device-id';
let cached: DeviceInfo | null = null;

/**
 * This installation of the app. The id is random, kept in secure storage and sent at
 * sign-in; the backend asks for an SMS code when it has not seen the id before (§2).
 */
export async function deviceInfo(): Promise<DeviceInfo> {
  if (cached) return cached;
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  cached = {
    id,
    name: Device.modelName ?? undefined,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
  return cached;
}
