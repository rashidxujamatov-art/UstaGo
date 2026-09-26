import type { SmsProvider } from './sms.provider.js';

const BASE_URL = 'https://notify.eskiz.uz/api';

export interface EskizConfig {
  email: string;
  password: string;
  from: string;
}

/**
 * Eskiz.uz gateway. The auth token lives about 30 days; on 401 the provider signs in
 * again once and retries. Every other failure is thrown — unlike the prototype it never
 * falls back to a fake token (CLAUDE.md, "Mavjud kod haqida").
 */
export class EskizSmsProvider implements SmsProvider {
  private token: string | null = null;

  constructor(
    private readonly config: EskizConfig,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(phone: string, text: string): Promise<void> {
    const response = await this.sendOnce(phone, text);
    if (response.status === 401) {
      this.token = null;
      await this.ensureOk(await this.sendOnce(phone, text), 'send');
      return;
    }
    await this.ensureOk(response, 'send');
  }

  private async sendOnce(phone: string, text: string): Promise<Response> {
    const body = new FormData();
    body.set('mobile_phone', phone.replace(/^\+/, ''));
    body.set('message', text);
    body.set('from', this.config.from);
    return this.fetchFn(`${BASE_URL}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.getToken()}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const body = new FormData();
    body.set('email', this.config.email);
    body.set('password', this.config.password);
    const response = await this.fetchFn(`${BASE_URL}/auth/login`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    await this.ensureOk(response, 'login');
    const payload = (await response.json()) as { data?: { token?: string } };
    const token = payload.data?.token;
    if (!token) throw new Error('Eskiz login returned no token');
    this.token = token;
    return token;
  }

  private async ensureOk(response: Response, step: string): Promise<void> {
    if (response.ok) return;
    const details = await response.text().catch(() => '');
    throw new Error(`Eskiz ${step} failed: HTTP ${response.status} ${details.slice(0, 200)}`);
  }
}
