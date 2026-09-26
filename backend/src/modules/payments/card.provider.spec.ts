import { formatSomDecimal, parseSomDecimal } from '../../common/money/money.js';
import { SecretBox } from '../../common/crypto/secret-box.js';
import { CardError, cardBrand, expireValid, luhnValid, maskPan } from './card.provider.js';
import { PaymeCardProvider } from './payme-card.provider.js';

describe('card helpers', () => {
  it('recognises the card networks by their first digits', () => {
    expect(cardBrand('8600123412341234')).toBe('UZCARD');
    expect(cardBrand('5614123412341234')).toBe('UZCARD');
    expect(cardBrand('9860123412341234')).toBe('HUMO');
    expect(cardBrand('4111111111111111')).toBe('VISA');
    expect(cardBrand('5500000000000004')).toBe('MASTERCARD');
    expect(cardBrand('1234123412341234')).toBeNull();
  });

  it('checks the Luhn digit, masks the number and the expiry', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('411111111111')).toBe(false);
    expect(maskPan('8600123412344417')).toBe('8600 **** **** 4417');
    const now = new Date('2026-09-27T00:00:00Z');
    expect(expireValid('09/26', now)).toBe(true);
    expect(expireValid('08/26', now)).toBe(false);
    expect(expireValid('13/30', now)).toBe(false);
  });
});

describe('provider money formats', () => {
  it('reads Click so‘m amounts without floats', () => {
    expect(parseSomDecimal('15500')).toBe(1_550_000n);
    expect(parseSomDecimal('15500.00')).toBe(1_550_000n);
    expect(parseSomDecimal('15500.5')).toBe(1_550_050n);
    expect(parseSomDecimal('15500.555')).toBeNull();
    expect(parseSomDecimal('-1')).toBeNull();
    expect(parseSomDecimal('1e5')).toBeNull();
    expect(formatSomDecimal(1_550_000n)).toBe('15500.00');
    expect(formatSomDecimal(1_550_050n)).toBe('15500.50');
  });
});

describe('SecretBox', () => {
  it('round-trips and never stores the plain token', () => {
    const box = new SecretBox(Buffer.alloc(32, 9).toString('base64'));
    const sealed = box.seal('card-token-123');
    expect(Buffer.from(sealed).toString('utf8')).not.toContain('card-token-123');
    expect(box.open(sealed)).toBe('card-token-123');
  });
});

describe('PaymeCardProvider (Payme Subscribe API)', () => {
  const config = { url: 'https://example.test/api', merchantId: 'm1', key: 'k1' };

  function fakeFetch(results: Record<string, unknown>) {
    const calls: { method: string; auth: string; params: unknown }[] = [];
    const fn = ((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as { method: string; params: unknown };
      const auth = (init.headers as Record<string, string>)['X-Auth'] ?? '';
      calls.push({ method: body.method, auth, params: body.params });
      const result = results[body.method];
      const payload = result instanceof Error ? { error: { code: -31630 } } : { result };
      return Promise.resolve(new Response(JSON.stringify(payload)));
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('tokenizes a Humo card and charges it with the merchant key', async () => {
    const { fn, calls } = fakeFetch({
      'cards.create': { card: { token: 'tok-1' } },
      'receipts.create': { receipt: { _id: 'r-1' } },
      'receipts.pay': { receipt: { _id: 'r-1', state: 4 } },
    });
    const provider = new PaymeCardProvider(config, fn);
    const card = await provider.create({ number: '9860123412344417', expire: '12/30' });
    expect(card).toEqual({ token: 'tok-1', maskedPan: '9860 **** **** 4417', brand: 'HUMO' });
    expect(calls[0]).toMatchObject({
      method: 'cards.create',
      auth: 'm1',
      params: { card: { number: '9860123412344417', expire: '1230' }, save: true },
    });

    expect(await provider.charge({ token: 'tok-1', amount: 5_000_000n, paymentId: 'p-1' })).toEqual(
      {
        receiptId: 'r-1',
      },
    );
    expect(calls[1]).toMatchObject({
      method: 'receipts.create',
      auth: 'm1:k1',
      params: { amount: 5_000_000, account: { payment_id: 'p-1' } },
    });
  });

  it('refuses Visa / Mastercard and maps Payme errors', async () => {
    const { fn } = fakeFetch({
      'cards.verify': new Error('wrong'),
      'receipts.create': new Error('x'),
    });
    const provider = new PaymeCardProvider(config, fn);
    await expect(
      provider.create({ number: '4111111111111111', expire: '12/30' }),
    ).rejects.toMatchObject({ kind: 'NOT_SUPPORTED' });
    await expect(provider.verify('tok', '000000')).rejects.toBeInstanceOf(CardError);
    await expect(
      provider.charge({ token: 'tok', amount: 100n, paymentId: 'p' }),
    ).rejects.toMatchObject({ kind: 'DECLINED' });
  });
});
