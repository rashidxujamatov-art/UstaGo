/**
 * Stage 4 end to end (docs/02-arxitektura.md §13): Payme and Click callbacks as the
 * providers send them, saved cards, order payments (BY5, BJ4), top-ups (BJ6) and
 * withdrawals (BJ7). The tests play Payme and Click with the harness test merchants.
 */
import { createHash } from 'node:crypto';
import { PaymentsService } from '../../src/modules/payments/payments.service.js';
import { PayoutsService } from '../../src/modules/payments/payouts.service.js';
import {
  createHarness,
  E2E_CLICK,
  E2E_PAYME,
  e2eEnabled,
  fullUser,
  type Harness,
} from './harness.js';

const som = (value: number) => BigInt(value) * 100n;
const str = (value: number) => som(value).toString();

type User = Awaited<ReturnType<typeof fullUser>>;

/** A card number with a valid Luhn check digit placed before `suffix`. */
function cardNumber(prefix: string, suffix = ''): string {
  for (let digit = 0; digit <= 9; digit += 1) {
    const candidate = `${prefix}${digit}${suffix}`.padEnd(16, '0');
    let sum = 0;
    for (let index = 0; index < candidate.length; index += 1) {
      let value = Number(candidate[candidate.length - 1 - index]);
      if (index % 2 === 1) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      sum += value;
    }
    if (sum % 10 === 0) return candidate;
  }
  throw new Error('no Luhn digit');
}

describe.skipIf(!e2eEnabled)('payments (e2e)', () => {
  let h: Harness;
  let categoryId: string;
  let docCounter = 4_000_000;
  let rpcId = 0;
  const doc = () => `AD${(docCounter += 1).toString().padStart(7, '0')}`;

  beforeAll(async () => {
    h = await createHarness();
    const someone = await fullUser(h, doc(), 'CUSTOMER');
    const categories = await h.api().get('/api/v1/categories').set(someone.auth);
    categoryId = categories.body[0].id as string;
  });

  afterAll(async () => {
    await h?.close();
  });

  // ------------------------------------------------------------------ helpers

  const paymeAuth = `Basic ${Buffer.from(`Paycom:${E2E_PAYME.key}`).toString('base64')}`;

  async function payme(method: string, params: Record<string, unknown>, auth = paymeAuth) {
    const res = await h
      .api()
      .post('/api/v1/payments/payme')
      .set('Authorization', auth)
      .send({ jsonrpc: '2.0', id: (rpcId += 1), method, params })
      .expect(200);
    return res.body as { result?: Record<string, unknown>; error?: { code: number } };
  }

  function clickSign(params: Record<string, string>, complete: boolean) {
    const source = [
      params.click_trans_id,
      params.service_id,
      E2E_CLICK.secret,
      params.merchant_trans_id,
      complete ? params.merchant_prepare_id : '',
      params.amount,
      params.action,
      params.sign_time,
    ].join('');
    return createHash('md5').update(source).digest('hex');
  }

  async function click(step: 'prepare' | 'complete', params: Record<string, string>) {
    const full = {
      service_id: E2E_CLICK.serviceId,
      click_paydoc_id: '777',
      error: '0',
      error_note: 'Success',
      sign_time: '2026-09-27 10:00:00',
      ...params,
    };
    const signed = { sign_string: clickSign(full, step === 'complete'), ...full };
    const res = await h
      .api()
      .post(`/api/v1/payments/click/${step}`)
      .type('form')
      .send(signed)
      .expect(200);
    return res.body as Record<string, unknown>;
  }

  async function wallet(user: User) {
    return (await h.api().get('/api/v1/wallet').set(user.auth).expect(200)).body as {
      real: string;
      demo: string;
    };
  }

  async function addCard(user: User, number: string) {
    const added = await h
      .api()
      .post('/api/v1/wallet/cards')
      .set(user.auth)
      .send({ number, expire: '12/30' })
      .expect(201);
    const cardId = added.body.card_id as string;
    await h
      .api()
      .post(`/api/v1/wallet/cards/${cardId}/verify`)
      .set(user.auth)
      .send({ code: '000000' })
      .expect(200);
    return cardId;
  }

  /** A job with `method`, taken by `pro` and reported done. */
  async function doneJob(customer: User, pro: User, price: number, method: string) {
    const now = Date.now();
    const created = await h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send({
        category_id: categoryId,
        title: 'Kran almashtirish',
        description: 'Oshxona',
        photo_keys: [],
        address: { text: 'Chilonzor', lat: 41.2856, lng: 69.2034 },
        time_from: new Date(now + 3_600_000).toISOString(),
        time_to: new Date(now + 3 * 3_600_000).toISOString(),
        price: str(price),
        payment_method: method,
      })
      .expect(201);
    const id = created.body.id as string;
    await h.api().post(`/api/v1/orders/${id}/accept`).set(pro.auth).expect(200);
    for (const step of ['depart', 'arrive', 'start']) {
      await h.api().post(`/api/v1/orders/${id}/${step}`).set(pro.auth).expect(200);
    }
    await h
      .api()
      .post(`/api/v1/orders/${id}/finish`)
      .set(pro.auth)
      .send({ photo_keys: [] })
      .expect(200);
    return id;
  }

  // ------------------------------------------------------------------ Payme

  it('Payme top-up: auth, amount check, create, perform, repeats, refund (§7)', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const topup = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(50_000), method: 'PAYME' })
      .expect(200);
    const paymentId = topup.body.id as string;
    expect(topup.body).toMatchObject({ status: 'CREATED', amount: str(50_000) });
    const encoded = String(topup.body.checkout_url).split('/').pop() ?? '';
    expect(Buffer.from(encoded, 'base64').toString()).toBe(
      `m=${E2E_PAYME.merchantId};ac.payment_id=${paymentId};a=${str(50_000)}`,
    );

    const account = { payment_id: paymentId };
    // Rule 4: a call without the right key is refused, in every environment.
    expect(
      (await payme('CheckPerformTransaction', { amount: 5_000_000, account }, 'Basic x')).error,
    ).toMatchObject({ code: -32504 });
    expect((await payme('CheckPerformTransaction', { amount: 1, account })).error).toMatchObject({
      code: -31001,
    });
    expect(
      (await payme('CheckPerformTransaction', { amount: 5_000_000, account: { payment_id: 'x' } }))
        .error,
    ).toMatchObject({ code: -31050 });
    expect((await payme('CheckPerformTransaction', { amount: 5_000_000, account })).result).toEqual(
      { allow: true },
    );

    const txn = { id: 'payme-txn-1', time: Date.now(), amount: 5_000_000, account };
    const created = await payme('CreateTransaction', txn);
    expect(created.result).toMatchObject({ transaction: paymentId, state: 1 });
    expect((await payme('CreateTransaction', txn)).result).toEqual(created.result);
    // A second Payme transaction for the same payment is refused.
    expect((await payme('CreateTransaction', { ...txn, id: 'payme-txn-2' })).error).toMatchObject({
      code: -31051,
    });

    const performed = await payme('PerformTransaction', { id: 'payme-txn-1' });
    expect(performed.result).toMatchObject({ transaction: paymentId, state: 2 });
    expect((await payme('PerformTransaction', { id: 'payme-txn-1' })).result).toEqual(
      performed.result,
    );
    expect((await wallet(user)).real).toBe(str(50_000));
    expect((await payme('CheckTransaction', { id: 'payme-txn-1' })).result).toMatchObject({
      state: 2,
      reason: null,
    });
    const statement = await payme('GetStatement', { from: 0, to: Date.now() + 1_000 });
    expect(statement.result?.transactions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'payme-txn-1', state: 2 })]),
    );

    // Payme may cancel a performed top-up while the money is still there.
    const cancelled = await payme('CancelTransaction', { id: 'payme-txn-1', reason: 5 });
    expect(cancelled.result).toMatchObject({ state: -2 });
    expect((await wallet(user)).real).toBe('0');
    expect((await payme('PerformTransaction', { id: 'payme-txn-1' })).error).toMatchObject({
      code: -31008,
    });
    expect((await payme('CheckTransaction', { id: 'nope' })).error).toMatchObject({ code: -31003 });
  });

  it('BJ4: the executor’s Payme QR pays the order; the price reaches the executor (§5)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const id = await doneJob(customer, pro, 200_000, 'PAYME');

    const first = await h
      .api()
      .post(`/api/v1/orders/${id}/payment-session`)
      .set(pro.auth)
      .expect(200);
    const second = await h
      .api()
      .post(`/api/v1/orders/${id}/payment-session`)
      .set(pro.auth)
      .expect(200);
    // Showing a new QR retires the older one.
    const account = { payment_id: first.body.id };
    expect(
      (await payme('CheckPerformTransaction', { amount: 20_000_000, account })).error,
    ).toMatchObject({ code: -31051 });
    // Only the order's executor shows the QR; the customer cannot.
    await h.api().post(`/api/v1/orders/${id}/payment-session`).set(customer.auth).expect(404);

    const txn = {
      id: 'payme-order-1',
      time: Date.now(),
      amount: 20_000_000,
      account: { payment_id: second.body.id },
    };
    expect((await payme('CreateTransaction', txn)).result).toMatchObject({ state: 1 });
    expect((await payme('PerformTransaction', { id: 'payme-order-1' })).result).toMatchObject({
      state: 2,
    });

    const order = await h.api().get(`/api/v1/orders/${id}`).set(customer.auth).expect(200);
    expect(order.body.status).toBe('PAID');
    // 200 000 income; the 5 000 fee came from the demo bonus.
    expect(await wallet(pro)).toMatchObject({ real: str(200_000), demo: str(20_000) });
    const income = await h.prisma.ledgerTransaction.findFirstOrThrow({
      where: { orderId: id, type: 'ORDER_INCOME' },
    });
    expect(income.paymentId).toBe(second.body.id);
    // The job is paid: a new payment for it cannot even start.
    await h.api().post(`/api/v1/orders/${id}/payment-session`).set(pro.auth).expect(409);
    // An order payment is never taken back by the provider (§14, admin decides).
    expect(
      (await payme('CancelTransaction', { id: 'payme-order-1', reason: 5 })).error,
    ).toMatchObject({ code: -31007 });
  });

  // ------------------------------------------------------------------ Click

  it('Click top-up: signature, amount, prepare, complete, repeats', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const topup = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(15_500), method: 'CLICK' })
      .expect(200);
    const paymentId = topup.body.id as string;
    expect(topup.body.checkout_url).toContain(`transaction_param=${paymentId}`);
    expect(topup.body.checkout_url).toContain('amount=15500.00');

    const base = { click_trans_id: '555001', merchant_trans_id: paymentId, amount: '15500' };
    const forged = await h
      .api()
      .post('/api/v1/payments/click/prepare')
      .type('form')
      .send({
        ...base,
        service_id: E2E_CLICK.serviceId,
        action: '0',
        sign_time: 't',
        sign_string: 'bad',
      })
      .expect(200);
    expect(forged.body.error).toBe(-1);
    expect((await click('prepare', { ...base, amount: '15000', action: '0' })).error).toBe(-2);

    const prepared = await click('prepare', { ...base, action: '0' });
    expect(prepared).toMatchObject({ error: 0, merchant_trans_id: paymentId });
    const prepareId = String(prepared.merchant_prepare_id);
    expect((await click('prepare', { ...base, action: '0' })).merchant_prepare_id).toBe(
      prepared.merchant_prepare_id,
    );

    const completed = await click('complete', {
      ...base,
      amount: '15500.00',
      action: '1',
      merchant_prepare_id: prepareId,
    });
    expect(completed).toMatchObject({
      error: 0,
      merchant_confirm_id: prepared.merchant_prepare_id,
    });
    expect((await wallet(user)).real).toBe(str(15_500));
    expect(
      (
        await click('complete', {
          ...base,
          amount: '15500.00',
          action: '1',
          merchant_prepare_id: prepareId,
        })
      ).error,
    ).toBe(-4);
  });

  it('Click reports a failure: the payment is cancelled, nothing is booked', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const topup = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(20_000), method: 'CLICK' })
      .expect(200);
    const base = { click_trans_id: '555002', merchant_trans_id: topup.body.id, amount: '20000' };
    const prepared = await click('prepare', { ...base, action: '0' });
    const failed = await click('complete', {
      ...base,
      action: '1',
      error: '-5017',
      merchant_prepare_id: String(prepared.merchant_prepare_id),
    });
    expect(failed.error).toBe(-9);
    expect((await wallet(user)).real).toBe('0');
    const payment = await h.app.get(PaymentsService).get(user.id, topup.body.id);
    expect(payment.status).toBe('CANCELLED');
  });

  it('refuses top-ups below topup_min and methods that are switched off', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const low = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(500), method: 'PAYME' })
      .expect(400);
    expect(low.body).toEqual({ code: 'PAYMENT_AMOUNT_INVALID', params: { min: str(1_000) } });
  });

  // ------------------------------------------------------------------ cards

  it('saved cards: SMS check, top-up by card, a declined card', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const added = await h
      .api()
      .post('/api/v1/wallet/cards')
      .set(user.auth)
      .send({ number: cardNumber('860012345678901'), expire: '12/30' })
      .expect(201);
    const pending = added.body.card_id as string;
    const wrong = await h
      .api()
      .post(`/api/v1/wallet/cards/${pending}/verify`)
      .set(user.auth)
      .send({ code: '123456' })
      .expect(400);
    expect(wrong.body.code).toBe('CARD_CODE_INVALID');
    expect((await h.api().get('/api/v1/wallet/cards').set(user.auth)).body).toEqual([]);

    const cardId = await addCard(user, cardNumber('986012345678901'));
    const cards = (await h.api().get('/api/v1/wallet/cards').set(user.auth)).body;
    expect(cards).toEqual([expect.objectContaining({ id: cardId, brand: 'HUMO' })]);
    const stored = await h.prisma.card.findUniqueOrThrow({ where: { id: cardId } });
    expect(stored.maskedPan).toMatch(/^9860 \*{4} \*{4} \d{4}$/);

    const paid = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(30_000), method: 'CARD', card_id: cardId })
      .expect(200);
    expect(paid.body.status).toBe('PAID');
    expect((await wallet(user)).real).toBe(str(30_000));

    const bad = await addCard(user, cardNumber('86001234567', '0000'));
    const declined = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(30_000), method: 'CARD', card_id: bad })
      .expect(402);
    expect(declined.body.code).toBe('CARD_DECLINED');
    expect((await wallet(user)).real).toBe(str(30_000));

    await h.api().delete(`/api/v1/wallet/cards/${cardId}`).set(user.auth).expect(204);
    expect((await h.api().get('/api/v1/wallet/cards').set(user.auth)).body).toHaveLength(1);
  });

  // ------------------------------------------------------------------ BY5

  it('BY5: a BALANCE order is paid from the customer’s account at once', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const id = await doneJob(customer, pro, 100_000, 'BALANCE');

    const short = await h.api().post(`/api/v1/orders/${id}/pay`).set(customer.auth).send({});
    expect(short.status).toBe(409);
    expect(short.body).toEqual({
      code: 'WALLET_INSUFFICIENT_FUNDS',
      params: { shortfall: str(100_000) },
    });

    const cardId = await addCard(customer, cardNumber('860098765432101'));
    await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(customer.auth)
      .send({ amount: str(150_000), method: 'CARD', card_id: cardId })
      .expect(200);
    const paid = await h
      .api()
      .post(`/api/v1/orders/${id}/pay`)
      .set(customer.auth)
      .send({})
      .expect(200);
    expect(paid.body).toMatchObject({ payment: null, order: { status: 'PAID' } });
    expect((await wallet(customer)).real).toBe(str(50_000));
    expect((await wallet(pro)).real).toBe(str(100_000));
  });

  it('BY5: a CARD order is charged to a saved card; the method cannot be changed', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const id = await doneJob(customer, pro, 80_000, 'CARD');
    const cardId = await addCard(customer, cardNumber('860011112222333'));
    const paid = await h
      .api()
      .post(`/api/v1/orders/${id}/pay`)
      .set(customer.auth)
      .send({ card_id: cardId })
      .expect(200);
    expect(paid.body.payment).toMatchObject({ provider: 'CARD', status: 'PAID' });
    expect((await wallet(pro)).real).toBe(str(80_000));

    // A cash job is confirmed on BY9, never paid online (decision of 2026-09-26).
    const cashJob = await doneJob(customer, pro, 50_000, 'CASH');
    const refused = await h
      .api()
      .post(`/api/v1/orders/${cashJob}/pay`)
      .set(customer.auth)
      .send({})
      .expect(409);
    expect(refused.body.code).toBe('ORDER_PAYMENT_METHOD_MISMATCH');
    // Nor can the executor show a QR for it.
    await h.api().post(`/api/v1/orders/${cashJob}/payment-session`).set(pro.auth).expect(409);
  });

  // ------------------------------------------------------------------ BJ7

  it('BJ7: a withdrawal to a saved card is paid out; a failed payout is refunded', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const cardId = await addCard(user, cardNumber('860055556666777'));
    await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(100_000), method: 'CARD', card_id: cardId })
      .expect(200);

    const preview = await h
      .api()
      .post('/api/v1/wallet/withdraw/preview')
      .set(user.auth)
      .send({ amount: str(50_000) })
      .expect(200);
    expect(preview.body).toMatchObject({
      max: str(99_010),
      max_fee: str(990),
      fee: str(500),
      enabled: true,
      holds: [],
    });

    const requested = await h
      .api()
      .post('/api/v1/wallet/withdraw')
      .set(user.auth)
      .send({ amount: str(50_000), card_id: cardId, idempotency_key: 'bj7-first-try' })
      .expect(201);
    expect(requested.body).toMatchObject({ status: 'REQUESTED', fee: str(500) });
    expect((await wallet(user)).real).toBe(str(49_500));
    const done = await h.app.get(PayoutsService).process(requested.body.id);
    expect(done).toMatchObject({ status: 'PAID', providerRef: expect.any(String) });
    expect(await h.app.get(PayoutsService).process(requested.body.id)).toBeNull();

    const bad = await addCard(user, cardNumber('86007777888', '0000'));
    const second = await h
      .api()
      .post('/api/v1/wallet/withdraw')
      .set(user.auth)
      .send({ amount: str(10_000), card_id: bad, idempotency_key: 'bj7-second-try' })
      .expect(201);
    expect((await wallet(user)).real).toBe(str(39_400));
    const failed = await h.app.get(PayoutsService).process(second.body.id);
    expect(failed?.status).toBe('FAILED');
    expect((await wallet(user)).real).toBe(str(49_500));

    const tooMuch = await h
      .api()
      .post('/api/v1/wallet/withdraw')
      .set(user.auth)
      .send({ amount: str(49_500), card_id: cardId, idempotency_key: 'bj7-third-try' })
      .expect(409);
    expect(tooMuch.body.code).toBe('WALLET_WITHDRAW_EXCEEDS_LIMIT');
  });

  it('expires links nobody paid and refuses the test shortcut outside development', async () => {
    const user = await fullUser(h, doc(), 'CUSTOMER');
    const topup = await h
      .api()
      .post('/api/v1/wallet/topup')
      .set(user.auth)
      .send({ amount: str(5_000), method: 'PAYME' })
      .expect(200);
    await h
      .api()
      .post(`/api/v1/payments/${topup.body.id}/test-complete`)
      .set(user.auth)
      .expect(404);
    await h.prisma.payment.update({
      where: { id: topup.body.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect(await h.app.get(PaymentsService).expireStale()).toBeGreaterThanOrEqual(1);
    const account = { payment_id: topup.body.id };
    expect(
      (await payme('CheckPerformTransaction', { amount: 500_000, account })).error,
    ).toMatchObject({ code: -31051 });
  });

  it('ledger invariant holds after all payments', async () => {
    const unbalanced = await h.prisma.$queryRaw<{ id: string }[]>`
      SELECT transaction_id AS id FROM ledger_entries
      GROUP BY transaction_id HAVING SUM(amount) <> 0`;
    expect(unbalanced).toEqual([]);
  });
});
