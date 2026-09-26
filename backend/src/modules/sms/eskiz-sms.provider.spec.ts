import { EskizSmsProvider } from './eskiz-sms.provider.js';

type Call = { url: string; auth: string | null; body: Record<string, string> };

function fakeFetch(responses: Response[]) {
  const calls: Call[] = [];
  const fn = vi.fn((url: string, init: RequestInit) => {
    const form = init.body as FormData;
    calls.push({
      url,
      auth: new Headers(init.headers).get('authorization'),
      body: Object.fromEntries(
        [...form.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : v.name]),
      ),
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return Promise.resolve(next);
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const config = { email: 'ops@example.com', password: 'secret', from: '4546' };

describe('EskizSmsProvider', () => {
  it('signs in once, then sends with the token and a number without "+"', async () => {
    const { fn, calls } = fakeFetch([
      json(200, { data: { token: 'T1' } }),
      json(200, { status: 'waiting' }),
      json(200, { status: 'waiting' }),
    ]);
    const provider = new EskizSmsProvider(config, fn);

    await provider.send('+998901234567', 'GTM: 123456');
    await provider.send('+998901234567', 'GTM: 654321');

    expect(calls.map((c) => c.url)).toEqual([
      'https://notify.eskiz.uz/api/auth/login',
      'https://notify.eskiz.uz/api/message/sms/send',
      'https://notify.eskiz.uz/api/message/sms/send',
    ]);
    expect(calls[1]).toMatchObject({
      auth: 'Bearer T1',
      body: { mobile_phone: '998901234567', message: 'GTM: 123456', from: '4546' },
    });
  });

  it('signs in again once when the token expired', async () => {
    const { fn, calls } = fakeFetch([
      json(200, { data: { token: 'OLD' } }),
      json(401, { message: 'Expired' }),
      json(200, { data: { token: 'NEW' } }),
      json(200, { status: 'waiting' }),
    ]);
    await new EskizSmsProvider(config, fn).send('+998901234567', 'x');
    expect(calls[3]?.auth).toBe('Bearer NEW');
  });

  it('throws instead of continuing with a fake token when sign-in fails', async () => {
    const { fn } = fakeFetch([json(401, { message: 'Invalid credentials' })]);
    await expect(new EskizSmsProvider(config, fn).send('+998901234567', 'x')).rejects.toThrow(
      /Eskiz login failed: HTTP 401/,
    );
  });

  it('throws when sending fails', async () => {
    const { fn } = fakeFetch([json(200, { data: { token: 'T' } }), json(500, { message: 'down' })]);
    await expect(new EskizSmsProvider(config, fn).send('+998901234567', 'x')).rejects.toThrow(
      /Eskiz send failed: HTTP 500/,
    );
  });
});
