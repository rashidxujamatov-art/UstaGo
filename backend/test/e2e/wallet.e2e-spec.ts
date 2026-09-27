/**
 * Stage 3 end to end (docs/02-arxitektura.md §13): settlement, referral, demo and the free
 * period, withdrawals and the finance totals — the §11 cases T1–T18 of
 * docs/01-biznes-qoidalar.md on a real database.
 */
import type { WalletAccountKind } from '../../src/generated/prisma/client.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { FinanceService } from '../../src/modules/wallet/finance.service.js';
import { FreePeriodService } from '../../src/modules/wallet/free-period.processor.js';
import { LedgerService, PLATFORM } from '../../src/modules/wallet/ledger.service.js';
import { WithdrawalsService } from '../../src/modules/wallet/withdrawals.service.js';
import { createHarness, e2eEnabled, fullUser, type Harness } from './harness.js';

const som = (value: number) => BigInt(value) * 100n;
const str = (value: number) => som(value).toString();
const DAY_MS = 24 * 60 * 60 * 1000;

type User = Awaited<ReturnType<typeof fullUser>>;
type Method = 'CASH' | 'XOLIS_QR' | 'CLICK' | 'PAYME' | 'CARD' | 'BALANCE';

describe.skipIf(!e2eEnabled)('wallet and settlement (e2e)', () => {
  let h: Harness;
  let categoryId: string;
  let l2: User;
  let l1: User;
  let docCounter = 3_000_000;
  const doc = () => `AC${(docCounter += 1).toString().padStart(7, '0')}`;

  beforeAll(async () => {
    h = await createHarness();
    l2 = await fullUser(h, doc(), 'CUSTOMER');
    l1 = await fullUser(h, doc(), 'CUSTOMER', l2.referralCode);
    const categories = await h.api().get('/api/v1/categories').set(l1.auth);
    categoryId = categories.body[0].id as string;
  });

  afterAll(async () => {
    await h?.close();
  });

  // ------------------------------------------------------------------ helpers

  async function setDemoBonus(amount: number) {
    await h.prisma.setting.update({ where: { key: 'demo_bonus' }, data: { value: str(amount) } });
  }

  /** An executor whose demo bonus is `demo` so'm, invited by L1 unless `referral` is null. */
  async function executor(demo: number, referral: string | null = l1.referralCode) {
    await setDemoBonus(demo);
    const user = await fullUser(h, doc(), 'EXECUTOR', referral ?? undefined);
    await setDemoBonus(25_000);
    return user;
  }

  /** Stands in for a stage-4 top-up: money from the provider clearing account to REAL. */
  async function creditReal(userId: string, amount: number) {
    const ledger = h.app.get(LedgerService);
    await h.prisma.$transaction(async (tx) => {
      await ledger.post(tx, {
        type: 'TOPUP',
        idempotencyKey: `test-topup:${userId}:${Date.now()}:${Math.random()}`,
        entries: [
          {
            accountId: await ledger.accountId(tx, PLATFORM, 'PAYMENT_CLEARING'),
            amount: -som(amount),
          },
          { accountId: await ledger.accountId(tx, userId, 'REAL'), amount: som(amount) },
        ],
      });
    });
  }

  async function balance(ownerKey: string, kind: WalletAccountKind): Promise<bigint> {
    const account = await h.prisma.walletAccount.findUnique({
      where: { ownerKey_kind: { ownerKey, kind } },
      select: { balance: true },
    });
    return account?.balance ?? 0n;
  }

  /** Balances of the accounts a settlement touches, to compare before and after. */
  async function snapshot(executorId: string) {
    return {
      real: await balance(executorId, 'REAL'),
      demo: await balance(executorId, 'DEMO'),
      l1: await balance(l1.id, 'REAL'),
      l2: await balance(l2.id, 'REAL'),
      revenue: await balance(PLATFORM, 'PLATFORM_REVENUE'),
      marketing: await balance(PLATFORM, 'PLATFORM_MARKETING'),
      demoSink: await balance(PLATFORM, 'DEMO_SINK'),
      clearing: await balance(PLATFORM, 'PAYMENT_CLEARING'),
    };
  }

  function delta(
    before: Awaited<ReturnType<typeof snapshot>>,
    after: Awaited<ReturnType<typeof snapshot>>,
  ) {
    return Object.fromEntries(
      Object.entries(after).map(([key, value]) => [
        key,
        (value - before[key as keyof typeof before]) / 100n,
      ]),
    );
  }

  /** Posts a job and takes it through to "Ishni tugatdim". */
  async function doneJob(customer: User, pro: User, price: number, method: Method) {
    const now = Date.now();
    const created = await h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send({
        category_id: categoryId,
        title: 'Konditsioner o‘rnatish',
        description: 'Ikkinchi qavat',
        photo_keys: [],
        address: { text: 'Yunusobod, 4-kvartal', lat: 41.3634, lng: 69.2869 },
        time_from: new Date(now + 3_600_000).toISOString(),
        time_to: new Date(now + 3 * 3_600_000).toISOString(),
        price: str(price),
        payment_method: method === 'XOLIS_QR' ? 'CASH' : method,
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

  /** Cash / Xolis: both confirmations; online: the stage-4 payment hook. */
  async function pay(customer: User, pro: User, id: string, method: Method) {
    if (method === 'CASH' || method === 'XOLIS_QR') {
      if (method === 'XOLIS_QR') {
        // A cash job paid to the pro's Xolis QR: the pro must be verified on Xolis (stage 5).
        await h.prisma.executorProfile.update({
          where: { userId: pro.id },
          data: { taxMethod: 'XOLIS', taxStatus: 'VERIFIED', xolisQr: 'xolis://pay/e2e' },
        });
      }
      await h
        .api()
        .post(`/api/v1/orders/${id}/paid`)
        .set(customer.auth)
        .send({ via: method })
        .expect(200);
      const paid = await h
        .api()
        .post(`/api/v1/orders/${id}/payment-received`)
        .set(pro.auth)
        .expect(200);
      expect(paid.body.status).toBe('PAID');
    } else {
      expect(await h.app.get(OrdersService).settleOnlinePayment(id)).toBe(true);
    }
  }

  // ------------------------------------------------------------------ §11 cases

  it('T1: cash 180 000 — fee 1 500 demo + 3 000 real, L1 450, L2 216, platform 2 556', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(1_500);
    await creditReal(pro.id, 551_250);

    const id = await doneJob(customer, pro, 180_000, 'CASH');
    const before = await snapshot(pro.id);
    await pay(customer, pro, id, 'CASH');
    expect(delta(before, await snapshot(pro.id))).toEqual({
      real: -3_000n,
      demo: -1_500n,
      l1: 450n,
      l2: 216n,
      revenue: 2_556n,
      marketing: -222n,
      demoSink: 1_500n,
      clearing: 0n,
    });
    const wallet = await h.api().get('/api/v1/wallet').set(pro.auth).expect(200);
    expect(wallet.body).toMatchObject({ real: str(548_250), demo: '0', holds: '0' });

    const hold = await h.prisma.walletHold.findFirstOrThrow({ where: { orderId: id } });
    expect(hold.status).toBe('SETTLED');

    // BJ5: one row per movement; the fee row carries its demo part.
    const history = await h.api().get('/api/v1/wallet/transactions').set(pro.auth).expect(200);
    expect(history.body.items[0]).toMatchObject({
      type: 'SERVICE_FEE',
      amount: str(-4_500),
      demo_amount: str(-1_500),
      order: { id, price: str(180_000), payment_method: 'CASH', fee_bps: 250 },
    });
    expect(history.body.items.map((item: { type: string }) => item.type)).toEqual([
      'SERVICE_FEE',
      'TOPUP',
      'DEMO_BONUS',
    ]);

    // U2 for L1: the bonus with the pro's name.
    const referrals = await h.api().get('/api/v1/me/referrals').set(l1.auth).expect(200);
    expect(referrals.body).toMatchObject({ l1_bps: 25, l2_bps: 12 });
    expect(referrals.body.recent[0]).toMatchObject({
      level: 1,
      amount: str(450),
      order_price: str(180_000),
      from: { first_name: expect.any(String) },
    });
  });

  it('T2: Click 500 000 from demo — referral only from the budget, platform 0', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(14_000);
    const id = await doneJob(customer, pro, 500_000, 'CLICK');

    const before = await snapshot(pro.id);
    await pay(customer, pro, id, 'CLICK');
    expect(delta(before, await snapshot(pro.id))).toEqual({
      real: 500_000n,
      demo: -12_500n,
      l1: 1_250n,
      l2: 600n,
      revenue: 0n,
      marketing: -1_850n,
      demoSink: 12_500n,
      clearing: -500_000n,
    });
    expect(await balance(pro.id, 'DEMO')).toBe(som(1_500));
    // A repeated callback changes nothing.
    expect(await h.app.get(OrdersService).settleOnlinePayment(id)).toBe(false);
    expect(await balance(pro.id, 'REAL')).toBe(som(500_000));
  });

  it.each([
    ['T3', 600_000, 'CARD', 15_000n, 1_500n, 720n, 12_780n],
    ['T4', 300_000, 'CASH', 7_500n, 750n, 360n, 6_390n],
    ['T5', 400_000, 'XOLIS_QR', 10_000n, 1_000n, 480n, 8_520n],
    ['T10', 123_457, 'CASH', 3_086n, 308n, 148n, 2_630n],
  ] as const)(
    '%s: %s via %s without demo',
    async (_, price, method, fee, refL1, refL2, platform) => {
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const pro = await executor(0);
      await creditReal(pro.id, 20_000);
      const id = await doneJob(customer, pro, price, method);

      const before = await snapshot(pro.id);
      await pay(customer, pro, id, method);
      const change = delta(before, await snapshot(pro.id));
      const income = method === 'CARD' ? BigInt(price) : 0n;
      expect(change).toMatchObject({
        real: income - fee,
        l1: refL1,
        l2: refL2,
        revenue: platform,
        marketing: 0n,
        demoSink: 0n,
      });
    },
  );

  it('T9: no referral chain — the platform keeps the whole 5 000', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(0, null);
    await creditReal(pro.id, 10_000);
    const id = await doneJob(customer, pro, 200_000, 'CASH');

    const before = await snapshot(pro.id);
    await pay(customer, pro, id, 'CASH');
    expect(delta(before, await snapshot(pro.id))).toMatchObject({
      real: -5_000n,
      l1: 0n,
      l2: 0n,
      revenue: 5_000n,
    });
    const referral = await h.prisma.ledgerTransaction.count({
      where: { orderId: id, type: { in: ['REFERRAL_L1', 'REFERRAL_L2'] } },
    });
    expect(referral).toBe(0);
  });

  it('a blocked L1 gets nothing; L2 is still paid (§6)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(0);
    await creditReal(pro.id, 10_000);
    const id = await doneJob(customer, pro, 300_000, 'CASH');

    await h.prisma.user.update({ where: { id: l1.id }, data: { status: 'BLOCKED' } });
    try {
      const before = await snapshot(pro.id);
      await pay(customer, pro, id, 'CASH');
      expect(delta(before, await snapshot(pro.id))).toMatchObject({
        l1: 0n,
        l2: 360n,
        revenue: 7_500n - 360n,
      });
    } finally {
      await h.prisma.user.update({ where: { id: l1.id }, data: { status: 'ACTIVE' } });
    }
  });

  it('T12: cash 300 000, real 50 000 — "To‘ladim", "Pulni qabul qildim", real 42 500', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(0);
    await creditReal(pro.id, 50_000);
    const id = await doneJob(customer, pro, 300_000, 'CASH');

    const paid = await h.api().post(`/api/v1/orders/${id}/paid`).set(customer.auth).expect(200);
    expect(paid.body).toMatchObject({ status: 'COMPLETED' });
    expect(paid.body.timeline.customer_paid_at).toBeTruthy();
    // Only the customer says "To'ladim"; only the executor says "Pulni qabul qildim".
    await h.api().post(`/api/v1/orders/${id}/paid`).set(pro.auth).expect(404);
    await h.api().post(`/api/v1/orders/${id}/payment-received`).set(customer.auth).expect(404);

    const closed = await h
      .api()
      .post(`/api/v1/orders/${id}/payment-received`)
      .set(pro.auth)
      .expect(200);
    expect(closed.body).toMatchObject({ status: 'PAID' });
    expect(closed.body.timeline).toMatchObject({
      executor_received_at: expect.any(String),
      paid_at: expect.any(String),
    });
    const wallet = await h.api().get('/api/v1/wallet').set(pro.auth).expect(200);
    expect(wallet.body.real).toBe(str(42_500));

    // Pressing again is a conflict, not a second charge.
    await h.api().post(`/api/v1/orders/${id}/payment-received`).set(pro.auth).expect(409);
    expect(await balance(pro.id, 'REAL')).toBe(som(42_500));

    const chat = await h.api().get(`/api/v1/orders/${id}/messages`).set(pro.auth).expect(200);
    const codes = chat.body.map((m: { system_code: string | null }) => m.system_code);
    expect(codes.slice(-2)).toEqual(['CUSTOMER_PAID', 'PAYMENT_RECEIVED']);
  });

  it('T13 / T14: both sides are blocked until the executor confirms', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(25_000);
    const id = await doneJob(customer, pro, 300_000, 'CASH');
    const { number } = await h.prisma.order.findUniqueOrThrow({ where: { id } });

    const blockedPost = await h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send(jobBody())
      .expect(409);
    expect(blockedPost.body).toEqual({
      code: 'ORDER_CUSTOMER_CONFIRMATION_REQUIRED',
      params: { order: number, order_id: id },
    });

    const other = await fullUser(h, doc(), 'CUSTOMER');
    const next = await doneJobPosted(other);
    const blockedAccept = await h
      .api()
      .post(`/api/v1/orders/${next}/accept`)
      .set(pro.auth)
      .expect(409);
    expect(blockedAccept.body).toEqual({
      code: 'ORDER_EXECUTOR_CONFIRMATION_REQUIRED',
      params: { order: number, order_id: id },
    });

    // The pro who got the money closes it without waiting for "To'ladim" (§5.1).
    await h.api().post(`/api/v1/orders/${id}/payment-received`).set(pro.auth).expect(200);
    await h.api().post(`/api/v1/orders/${next}/accept`).set(pro.auth).expect(200);
    await h.api().post('/api/v1/orders').set(customer.auth).send(jobBody()).expect(201);
  });

  /** A valid BY2 body: 100 000 cash. */
  function jobBody() {
    const now = Date.now();
    return {
      category_id: categoryId,
      title: 'Kran',
      description: 'Oshxona',
      photo_keys: [],
      address: { text: 'Chilonzor', lat: 41.2856, lng: 69.2034 },
      time_from: new Date(now + 3_600_000).toISOString(),
      time_to: new Date(now + 3 * 3_600_000).toISOString(),
      price: str(100_000),
      payment_method: 'CASH',
    };
  }

  /** A published job for the block checks. */
  async function doneJobPosted(customer: User) {
    const created = await h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send(jobBody())
      .expect(201);
    return created.body.id as string;
  }

  it('T15: "Pul kelmadi" opens a dispute, lifts the block and keeps the hold', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(25_000);
    const id = await doneJob(customer, pro, 300_000, 'CASH');

    const disputed = await h
      .api()
      .post(`/api/v1/orders/${id}/payment-not-received`)
      .set(pro.auth)
      .send({ note: 'Mijoz pul bermadi' })
      .expect(200);
    expect(disputed.body).toMatchObject({ status: 'DISPUTED', dispute: { by_me: true } });
    const hold = await h.prisma.walletHold.findFirstOrThrow({ where: { orderId: id } });
    expect(hold.status).toBe('ACTIVE');

    const next = await doneJobPosted(customer); // the customer is not blocked either
    await h.api().post(`/api/v1/orders/${next}/accept`).set(pro.auth).expect(200);
    // A disputed job cannot be confirmed by either side any more.
    await h.api().post(`/api/v1/orders/${id}/payment-received`).set(pro.auth).expect(409);
    await h.api().post(`/api/v1/orders/${id}/paid`).set(customer.auth).expect(409);
  });

  it('confirmations are for cash and Xolis only', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(25_000);
    const id = await doneJob(customer, pro, 100_000, 'PAYME');
    const res = await h.api().post(`/api/v1/orders/${id}/paid`).set(customer.auth).expect(409);
    expect(res.body.code).toBe('ORDER_PAYMENT_METHOD_MISMATCH');
    await pay(customer, pro, id, 'PAYME');
  });

  it('T18: free period over — held demo is kept and pays the fee; the rest burns', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(25_000);
    const id = await doneJob(customer, pro, 180_000, 'CASH'); // 4 500 demo held

    await h.prisma.executorProfile.update({
      where: { userId: pro.id },
      data: { freePeriodEnd: new Date(Date.now() - 1_000) },
    });
    const view = await h.api().get('/api/v1/wallet').set(pro.auth).expect(200);
    expect(view.body).toMatchObject({
      demo: str(4_500), // only the held part still counts, before the job runs
      free_period: { active: false, days_left: 0 },
    });

    const { expired } = await h.app.get(FreePeriodService).run();
    expect(expired).toBeGreaterThanOrEqual(1);
    expect(await balance(pro.id, 'DEMO')).toBe(som(4_500));
    expect(await h.app.get(FreePeriodService).run()).toMatchObject({ expired: 0 });

    const before = await snapshot(pro.id);
    await pay(customer, pro, id, 'CASH');
    expect(delta(before, await snapshot(pro.id))).toMatchObject({
      demo: -4_500n,
      real: 0n,
      demoSink: 4_500n,
      l1: 450n, // all from the budget
      marketing: -666n,
    });

    // Without a tax method the pro takes no new jobs (§4, §9).
    const next = await doneJobPosted(customer);
    const res = await h.api().post(`/api/v1/orders/${next}/accept`).set(pro.auth).expect(403);
    expect(res.body.code).toBe('TAX_METHOD_REQUIRED');
  });

  it('demo freed by a cancellation after the free period burns on the next run', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(25_000);
    const id = await doneJobPosted(customer);
    await h.api().post(`/api/v1/orders/${id}/accept`).set(pro.auth).expect(200);
    await h.prisma.executorProfile.update({
      where: { userId: pro.id },
      data: { freePeriodEnd: new Date(Date.now() - 1_000) },
    });
    await h.app.get(FreePeriodService).run();
    expect(await balance(pro.id, 'DEMO')).toBe(som(2_500)); // 2.5% of 100 000 held

    await h
      .api()
      .post(`/api/v1/orders/${id}/cancel`)
      .set(customer.auth)
      .send({ reason: 'NOT_NEEDED' })
      .expect(200);
    await h.app.get(FreePeriodService).run();
    expect(await balance(pro.id, 'DEMO')).toBe(0n);
    expect(await balance(PLATFORM, 'DEMO_ISSUANCE')).toBeLessThan(0n);
  });

  it('reminds 7, 3 and 1 days before the free period ends, once per mark (§8)', async () => {
    const pro = await executor(25_000);
    const service = h.app.get(FreePeriodService);
    const setEnd = (ms: number) =>
      h.prisma.executorProfile.update({
        where: { userId: pro.id },
        data: { freePeriodEnd: new Date(Date.now() + ms) },
      });
    const marks = async () =>
      (await h.prisma.executorProfile.findUniqueOrThrow({ where: { userId: pro.id } }))
        .remindedDays;

    await setEnd(2.5 * DAY_MS); // 3 days left: the 7 and 3 marks in one push
    expect(await service.remind()).toBeGreaterThanOrEqual(1);
    expect(await marks()).toEqual([7, 3]);
    await service.remind();
    expect(await marks()).toEqual([7, 3]);

    await setEnd(0.5 * DAY_MS);
    await service.remind();
    expect(await marks()).toEqual([7, 3, 1]);
  });

  it('T7: withdrawal keeps the held fee — at most 600 000, fee 6 000, then real 15 000', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const pro = await executor(0);
    await creditReal(pro.id, 621_000);
    const id = await doneJobPosted(customer);
    await h.prisma.order.update({ where: { id }, data: { price: som(600_000) } });
    await h.api().post(`/api/v1/orders/${id}/accept`).set(pro.auth).expect(200); // holds 15 000

    const withdrawals = h.app.get(WithdrawalsService);
    expect(await withdrawals.quote(pro.id)).toEqual({
      mustKeep: som(15_000),
      max: som(600_000),
      maxFee: som(6_000),
    });
    await expect(withdrawals.request(pro.id, som(621_000), 'k1')).rejects.toMatchObject({
      code: 'WALLET_WITHDRAW_EXCEEDS_LIMIT',
      params: { must_keep: som(15_000), max: som(600_000), fee: som(6_000) },
    });

    const revenue = await balance(PLATFORM, 'PLATFORM_REVENUE');
    const fees = await balance(PLATFORM, 'PAYOUT_PROVIDER_FEES');
    const first = await withdrawals.request(pro.id, som(600_000), 'k2');
    const repeated = await withdrawals.request(pro.id, som(600_000), 'k2');
    expect(repeated.id).toBe(first.id);
    expect(await balance(pro.id, 'REAL')).toBe(som(15_000));
    expect((await balance(PLATFORM, 'PAYOUT_PROVIDER_FEES')) - fees).toBe(som(6_000));
    expect(await balance(PLATFORM, 'PLATFORM_REVENUE')).toBe(revenue);
  });

  it('T8 / T17: a customer withdraws 99 010 of 100 000; a failed payout returns it all', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    await creditReal(customer.id, 100_000);
    const withdrawals = h.app.get(WithdrawalsService);
    expect(await withdrawals.quote(customer.id)).toEqual({
      mustKeep: 0n,
      max: som(99_010),
      maxFee: som(990),
    });

    const revenue = await balance(PLATFORM, 'PLATFORM_REVENUE');
    const fees = await balance(PLATFORM, 'PAYOUT_PROVIDER_FEES');
    const withdrawal = await withdrawals.request(customer.id, som(99_010), 'w1');
    expect(withdrawal).toMatchObject({ status: 'REQUESTED', fee: som(990) });
    expect(await balance(customer.id, 'REAL')).toBe(0n);
    expect((await balance(PLATFORM, 'PAYOUT_PROVIDER_FEES')) - fees).toBe(som(990));
    expect(await balance(PLATFORM, 'PLATFORM_REVENUE')).toBe(revenue);

    const failed = await withdrawals.markFailed(withdrawal.id, 'card closed');
    expect(failed.status).toBe('FAILED');
    expect(await balance(customer.id, 'REAL')).toBe(som(100_000));
    expect(await balance(PLATFORM, 'PAYOUT_PROVIDER_FEES')).toBe(fees);

    const history = await h.api().get('/api/v1/wallet/transactions').set(customer.auth).expect(200);
    expect(history.body.items.map((item: { type: string }) => item.type)).toEqual([
      'WITHDRAWAL_FEE_REFUND',
      'WITHDRAWAL_REFUND',
      'WITHDRAWAL_FEE',
      'WITHDRAWAL',
      'TOPUP',
    ]);
  });

  it('T11: finance totals — turnover 52 000 000, 5 600 000 of it paid from demo', async () => {
    const [clock] = await h.prisma.$queryRaw<[{ now: Date }]>`SELECT now()`;
    const from = clock.now;
    const customer = await fullUser(h, doc(), 'CUSTOMER');

    const demoPro = await executor(140_000);
    const demoJob = await doneJob(customer, demoPro, 5_600_000, 'CASH');
    await pay(customer, demoPro, demoJob, 'CASH');

    const realPro = await executor(0);
    await creditReal(realPro.id, 1_200_000);
    const realJob = await doneJob(customer, realPro, 46_400_000, 'CASH');
    await pay(customer, realPro, realJob, 'CASH');

    const summary = await h.app.get(FinanceService).summary(from, new Date(Date.now() + 60_000));
    expect(summary).toEqual({
      turnover: som(52_000_000),
      commissionReal: som(1_160_000),
      demoCommission: som(140_000),
      refL1: som(130_000),
      refL1Budget: som(14_000),
      refL2: som(62_400),
      refL2Budget: som(6_720),
      platform: som(988_320),
      marketing: som(20_720),
      platformNet: som(967_600),
      payoutProviderFees: 0n,
    });
  });

  it('ledger invariant: every transaction sums to zero', async () => {
    const unbalanced = await h.prisma.$queryRaw<{ id: string }[]>`
      SELECT transaction_id AS id FROM ledger_entries
      GROUP BY transaction_id HAVING SUM(amount) <> 0`;
    expect(unbalanced).toEqual([]);
    const cached = await h.prisma.$queryRaw<{ id: string }[]>`
      SELECT a.id FROM wallet_accounts a
      LEFT JOIN ledger_entries e ON e.account_id = a.id
      GROUP BY a.id, a.balance HAVING a.balance <> COALESCE(SUM(e.amount), 0)`;
    expect(cached).toEqual([]);
  });
});
