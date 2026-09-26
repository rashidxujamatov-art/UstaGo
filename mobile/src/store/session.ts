import { create } from 'zustand';
import type { TokenStore } from '../api/client';
import type { Me, TokenPair } from '../api/types';
import { secureStorage } from '../lib/secure-storage';

const REFRESH_TOKEN_KEY = 'refresh-token';

/**
 * - loading: reading the saved session at start-up
 * - offline: a saved session exists but the server could not be reached
 * - signedOut / signedIn
 */
export type SessionStatus = 'loading' | 'offline' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  user: Me | null;
  accessToken: string | null;
  setStatus: (status: SessionStatus) => void;
  setUser: (user: Me) => void;
  setAccessToken: (token: string | null) => void;
  reset: () => void;
}

export const useSession = create<SessionState>()((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  setStatus: (status) => set({ status }),
  setUser: (user) => set({ user, status: 'signedIn' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  reset: () => set({ status: 'signedOut', user: null, accessToken: null }),
}));

/** The access token lives in memory only; the refresh token in the OS secure storage. */
export const sessionTokenStore: TokenStore = {
  accessToken: () => useSession.getState().accessToken,
  refreshToken: () => secureStorage.getItem(REFRESH_TOKEN_KEY),
  async save(tokens: TokenPair) {
    await secureStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    useSession.getState().setAccessToken(tokens.access_token);
  },
  async clear() {
    await secureStorage.deleteItem(REFRESH_TOKEN_KEY);
    useSession.getState().reset();
  },
};
