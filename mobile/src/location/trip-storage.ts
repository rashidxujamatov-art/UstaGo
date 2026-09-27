import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'trip-active-order-id';

/**
 * Which order the background location task should post points to. It cannot live in React
 * state: `expo-task-manager` may re-run the task in a fresh JS context after the OS restarts
 * the app, so the task reads this plain, synchronously-persisted value instead.
 */
export const activeTripStorage = {
  get: (): Promise<string | null> => AsyncStorage.getItem(KEY),
  set: (orderId: string): Promise<void> => AsyncStorage.setItem(KEY, orderId),
  clear: (): Promise<void> => AsyncStorage.removeItem(KEY),
};
