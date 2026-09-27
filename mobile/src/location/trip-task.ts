import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { endpoints } from '../api/endpoints';
import { type RawLocationSample, shouldStopTracking, toTripPoints } from './trip-batch';
import { activeTripStorage } from './trip-storage';

/** Registered once at import time (`app/_layout.tsx`) so it survives the app being restarted
 * by the OS while a trip is active — `expo-task-manager` needs the task defined again before
 * it can deliver the next batch to a fresh JS context. */
export const TRIP_LOCATION_TASK = 'trip-location-task';

TaskManager.defineTask<{ locations: RawLocationSample[] }>(
  TRIP_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) return;
    const orderId = await activeTripStorage.get();
    if (!orderId) return;

    const points = toTripPoints(data?.locations ?? []);
    if (points.length === 0) return;

    try {
      const result = await endpoints.tripPoints(orderId, points);
      if (shouldStopTracking(result)) await stopTripTracking();
    } catch {
      // Offline or a transient failure: this batch is dropped, the next one tries again.
    }
  },
);

export interface StartTripTrackingOptions {
  /** `location_interval_sec` from `/config`. */
  intervalSec: number;
  notificationTitle: string;
  notificationBody: string;
}

/** BJ11 "Ha, yo'lga chiqdim": starts (or restarts) posting the pro's position for this order. */
export async function startTripTracking(
  orderId: string,
  options: StartTripTrackingOptions,
): Promise<void> {
  await activeTripStorage.set(orderId);
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  }
  await Location.startLocationUpdatesAsync(TRIP_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: options.intervalSec * 1000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: options.notificationTitle,
      notificationBody: options.notificationBody,
    },
  });
}

/** BJ12 "Yetib keldim", "To'xtatish", decline/cancel, or the server reporting `active: false`. */
export async function stopTripTracking(): Promise<void> {
  await activeTripStorage.clear();
  if (await Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TRIP_LOCATION_TASK);
  }
}

/** True while a trip task is still registered (e.g. right after the app restarted mid-trip). */
export function isTripTrackingActive(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(TRIP_LOCATION_TASK).catch(() => false);
}
