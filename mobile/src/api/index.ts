import { sessionTokenStore } from '../store/session';
import { ApiClient } from './client';

/**
 * Base URL of the backend, e.g. http://10.0.2.2:4000/api/v1 for the Android emulator.
 * Set EXPO_PUBLIC_API_URL in mobile/.env.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const api = new ApiClient(API_URL, sessionTokenStore);
