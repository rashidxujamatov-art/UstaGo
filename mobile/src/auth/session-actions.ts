import { api } from '../api';
import { ApiError } from '../api/client';
import { endpoints } from '../api/endpoints';
import type { SignedIn } from '../api/types';
import { disconnectRealtime } from '../realtime/socket';
import { themeToApi, usePreferences } from '../store/preferences';
import { sessionTokenStore, useSession } from '../store/session';

/** Restores the saved session at start-up. */
export async function bootstrapSession(): Promise<void> {
  const session = useSession.getState();
  session.setStatus('loading');
  if (!(await sessionTokenStore.refreshToken())) {
    session.reset();
    return;
  }
  if (!(await api.refresh())) {
    // Rejected token: the client already cleared it. Otherwise the server is unreachable.
    if (useSession.getState().status !== 'signedOut') session.setStatus('offline');
    return;
  }
  try {
    session.setUser(await endpoints.me());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await sessionTokenStore.clear();
    else session.setStatus('offline');
  }
}

/** Stores the tokens and copies this device's language and appearance to the account. */
export async function completeSignIn({ tokens, user }: SignedIn): Promise<void> {
  await sessionTokenStore.save(tokens);
  useSession.getState().setUser(user);

  const { language, themeMode } = usePreferences.getState();
  if (user.lang !== language || user.theme !== themeToApi(themeMode)) {
    endpoints
      .updatePreferences({ lang: language, theme: themeToApi(themeMode) })
      .then((me) => useSession.getState().setUser(me))
      .catch(() => undefined); // not critical; retried on the next change
  }
}

export async function signOut(): Promise<void> {
  try {
    await endpoints.logout();
  } catch {
    // Already invalid or offline: signing out locally is enough.
  }
  disconnectRealtime();
  await sessionTokenStore.clear();
}
