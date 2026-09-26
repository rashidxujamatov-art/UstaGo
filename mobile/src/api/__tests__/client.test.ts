import { ApiClient, ApiError, type TokenStore } from '../client';
import type { TokenPair } from '../types';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

function memoryTokens(access: string | null, refresh: string | null) {
  const state = { access, refresh, cleared: false };
  const store: TokenStore = {
    accessToken: () => state.access,
    refreshToken: () => Promise.resolve(state.refresh),
    save: (tokens: TokenPair) => {
      state.access = tokens.access_token;
      state.refresh = tokens.refresh_token;
      return Promise.resolve();
    },
    clear: () => {
      state.access = null;
      state.refresh = null;
      state.cleared = true;
      return Promise.resolve();
    },
  };
  return { store, state };
}

type Handler = (url: string, init: RequestInit) => Response;

function fakeFetch(handler: Handler) {
  const calls: { url: string; auth: string | null; body: unknown }[] = [];
  const fn = jest.fn((url: string, init: RequestInit) => {
    calls.push({
      url,
      auth: (init.headers as Record<string, string>).Authorization ?? null,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    return Promise.resolve(handler(url, init));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const pair = (n: number): TokenPair => ({
  access_token: `A${n}`,
  access_expires_in: 900,
  refresh_token: `R${n}`,
});

describe('ApiClient', () => {
  it('sends the bearer token and parses JSON', async () => {
    const { store } = memoryTokens('A0', 'R0');
    const { fn, calls } = fakeFetch(() => json(200, { id: 'u1' }));
    const api = new ApiClient('http://api/v1', store, fn);

    await expect(api.get('/me')).resolves.toEqual({ id: 'u1' });
    expect(calls[0]).toMatchObject({ url: 'http://api/v1/me', auth: 'Bearer A0' });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { store, state } = memoryTokens('OLD', 'R0');
    const { fn, calls } = fakeFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, pair(1));
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer A1'
        ? json(200, { ok: true })
        : json(401, { code: 'UNAUTHORIZED', params: {} });
    });
    const api = new ApiClient('http://api/v1', store, fn);

    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(state).toMatchObject({ access: 'A1', refresh: 'R1' });
    expect(calls.map((c) => c.url.replace('http://api/v1', ''))).toEqual([
      '/me',
      '/auth/refresh',
      '/me',
    ]);
    expect(calls[1]?.body).toEqual({ refresh_token: 'R0' });
  });

  it('uses a single refresh for parallel 401s (a reused refresh token signs everyone out)', async () => {
    const { store } = memoryTokens('OLD', 'R0');
    let refreshes = 0;
    const { fn } = fakeFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes += 1;
        return json(200, pair(refreshes));
      }
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === 'Bearer OLD' ? json(401, { code: 'UNAUTHORIZED' }) : json(200, {});
    });
    const api = new ApiClient('http://api/v1', store, fn);

    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshes).toBe(1);
  });

  it('signs out locally when the refresh token is rejected', async () => {
    const { store, state } = memoryTokens('OLD', 'R0');
    const { fn } = fakeFetch(() => json(401, { code: 'AUTH_SESSION_INVALID', params: {} }));
    const api = new ApiClient('http://api/v1', store, fn);

    await expect(api.get('/me')).rejects.toMatchObject({ status: 401 });
    expect(state.cleared).toBe(true);
  });

  it('never sends tokens to public endpoints', async () => {
    const { store } = memoryTokens('A0', 'R0');
    const { fn, calls } = fakeFetch(() =>
      json(401, { code: 'AUTH_INVALID_CREDENTIALS', params: {} }),
    );
    const api = new ApiClient('http://api/v1', store, fn);

    await expect(api.post('/auth/login', {}, { auth: false })).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.auth).toBeNull();
  });

  it('turns error bodies and network failures into ApiError', async () => {
    const { store } = memoryTokens(null, null);
    const api = new ApiClient(
      'http://api/v1',
      store,
      fakeFetch(() => json(409, { code: 'AUTH_PHONE_TAKEN', params: {} })).fn,
    );
    const error = await api.post('/auth/register', {}, { auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'AUTH_PHONE_TAKEN' });

    const offline = new ApiClient('http://api/v1', store, (() =>
      Promise.reject(new TypeError('Network request failed'))) as typeof fetch);
    await expect(offline.get('/config', { auth: false })).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('returns undefined for 204', async () => {
    const { store } = memoryTokens('A0', 'R0');
    const api = new ApiClient(
      'http://api/v1',
      store,
      fakeFetch(() => new Response(null, { status: 204 })).fn,
    );
    await expect(api.post('/auth/logout')).resolves.toBeUndefined();
  });
});
