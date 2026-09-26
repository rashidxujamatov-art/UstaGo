import type { ApiErrorBody } from './error-messages';
import type { TokenPair } from './types';

/** An error answer of the API, or a network failure (`code: 'NETWORK'`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params: NonNullable<ApiErrorBody['params']> = {},
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export interface TokenStore {
  accessToken(): string | null;
  refreshToken(): Promise<string | null>;
  save(tokens: TokenPair): Promise<void>;
  /** Called when the refresh token is rejected: the user is signed out locally. */
  clear(): Promise<void>;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  body?: unknown;
  /** Public endpoints do not send the access token and never refresh. */
  auth?: boolean;
}

/**
 * Small fetch wrapper: JSON in and out, bearer token, one transparent refresh on 401.
 * Refreshes are single-flight, because the backend treats a reused refresh token as theft.
 */
export class ApiClient {
  private refreshing: Promise<boolean> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenStore,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  get<T>(path: string, options?: RequestOptions) {
    return this.request<T>('GET', path, options);
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('POST', path, { ...options, body });
  }
  patch<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>('PATCH', path, { ...options, body });
  }
  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>('DELETE', path, options);
  }

  async request<T>(method: Method, path: string, options: RequestOptions = {}): Promise<T> {
    const auth = options.auth ?? true;
    let response = await this.send(method, path, options.body, auth);
    if (response.status === 401 && auth && (await this.refresh())) {
      response = await this.send(method, path, options.body, auth);
    }
    return this.parse<T>(response);
  }

  /** Exchanges the refresh token; false when the session is over. */
  refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.tokens.refreshToken();
    if (!refreshToken) return false;
    let response: Response;
    try {
      response = await this.send('POST', '/auth/refresh', { refresh_token: refreshToken }, false);
    } catch {
      return false; // offline: keep the session, try again later
    }
    if (!response.ok) {
      if (response.status === 401) await this.tokens.clear();
      return false;
    }
    await this.tokens.save((await response.json()) as TokenPair);
    return true;
  }

  private async send(
    method: Method,
    path: string,
    body: unknown,
    auth: boolean,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = auth ? this.tokens.accessToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK');
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    const data: unknown = text ? JSON.parse(text) : undefined;
    if (response.ok) return data as T;

    const error = data as Partial<ApiErrorBody> | undefined;
    throw new ApiError(response.status, error?.code ?? 'INTERNAL_ERROR', error?.params ?? {});
  }
}
