/**
 * Stage 5 end to end (docs/02-arxitektura.md §13): tax methods after the free period
 * (docs/01-biznes-qoidalar.md §9) — the automatic self-employed check, the admin queue
 * (AD1), Paynet Xolis, the super-admin switches (SA5) and the rule that a pro without a
 * verified method takes no new jobs.
 */
import { createHash } from 'node:crypto';
import { TaxService } from '../../src/modules/tax/tax.service.js';
import { LedgerService, PLATFORM } from '../../src/modules/wallet/ledger.service.js';
import { createHarness, e2eEnabled, fullUser, type Harness } from './harness.js';

const som = (value: number) => (BigInt(value) * 100n).toString();
type User = Awaited<ReturnType<typeof fullUser>>;

describe.skipIf(!e2eEnabled)('tax methods (e2e)', () => {
  let h: Harness;
  let categoryId: string;
  let admin: User;
  let superAdmin: User;
  let docCounter = 5_000_000;

  /**
   * A document number whose mock PINFL ends in 0 (`manual`: the tax system "cannot find"
   * the person, so the certificate goes to an admin) or not.
   */
  function doc(manual = false): string {
    for (;;) {
      const candidate = `AF${(docCounter += 1).toString().padStart(7, '0')}`;
      const lastDigit = (createHash('sha256').update(candidate).digest()[12] ?? 0) % 10;
      if ((lastDigit === 0) === manual) return candidate;
    }
  }

  beforeAll(async () => {
    h = await createHarness();
    admin = await fullUser(h, doc(), 'CUSTOMER');
    superAdmin = await fullUser(h, doc(), 'CUSTOMER');
    await h.prisma.staffPermission.createMany({
      data: [
        { userId: admin.id, role: 'ADMIN', permissions: ['users.manage'] },
        { userId: superAdmin.id, role: 'SUPER_ADMIN', permissions: [] },
      ],
    });
    const categories = await h.api().get('/api/v1/categories').set(admin.auth);
    categoryId = categories.body[0].id as string;
  });

  afterAll(async () => {
    await h?.close();
  });

  async function endFreePeriod(user: User) {
    await h.prisma.executorProfile.update({
      where: { userId: user.id },
      data: { freePeriodEnd: new Date(Date.now() - 1_000) },
    });
  }

  /** After the free month demo money pays no fees (§8), so the pro needs real money. */
  async function creditReal(userId: string, amount: number) {
    const ledger = h.app.get(LedgerService);
    await h.prisma.$transaction(async (tx) => {
      await ledger.post(tx, {
        type: 'TOPUP',
        idempotencyKey: `test-topup:${userId}:${Date.now()}:${Math.random()}`,
        entries: [
          {
            accountId: await ledger.accountId(tx, PLATFORM, 'PAYMENT_CLEARING'),
            amount: -BigInt(som(amount)),
          },
          { accountId: await ledger.accountId(tx, userId, 'REAL'), amount: BigInt(som(amount)) },
        ],
      });
    });
  }

  /** Not async: returns the supertest request, so callers can chain .expect(). */
  function postJob(customer: User, method = 'CASH') {
    const now = Date.now();
    return h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send({
        category_id: categoryId,
        title: 'Rozetka',
        description: 'Yotoqxona',
        photo_keys: [],
        address: { text: 'Chilonzor', lat: 41.2856, lng: 69.2034 },
        time_from: new Date(now + 3_600_000).toISOString(),
        time_to: new Date(now + 3 * 3_600_000).toISOString(),
        price: som(100_000),
        payment_method: method,
      });
  }

  it('BJ8: after the free month a pro without a method takes no jobs', async () => {
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const status = await h.api().get('/api/v1/tax/status').set(pro.auth).expect(200);
    expect(status.body).toMatchObject({
      method: null,
      status: 'NONE',
      pending: null,
      methods_enabled: ['SELF_EMPLOYED', 'XOLIS'],
      free_period: { active: true },
    });

    await endFreePeriod(pro);
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const job = (await postJob(customer).expect(201)).body.id as string;
    const refused = await h.api().post(`/api/v1/orders/${job}/accept`).set(pro.auth).expect(403);
    expect(refused.body.code).toBe('TAX_METHOD_REQUIRED');

    // The worker tells the pro once (BJ8 push) and not again.
    const tax = h.app.get(TaxService);
    expect((await tax.dailyCheck()).ended).toBeGreaterThanOrEqual(1);
    const marks = await h.prisma.executorProfile.findUniqueOrThrow({ where: { userId: pro.id } });
    expect(marks.remindedDays).toContain(0);
  });

  it('BJ8 → BJ9: self-employed confirmed by the tax system at once', async () => {
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const verified = await h
      .api()
      .post('/api/v1/tax/self-employed')
      .set(pro.auth)
      .send({})
      .expect(200);
    expect(verified.body).toMatchObject({
      method: 'SELF_EMPLOYED',
      status: 'VERIFIED',
      valid_until: expect.any(String),
    });

    await endFreePeriod(pro);
    await creditReal(pro.id, 50_000);
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const job = (await postJob(customer).expect(201)).body.id as string;
    await h.api().post(`/api/v1/orders/${job}/accept`).set(pro.auth).expect(200);

    // An expired certificate stops new jobs even before the hourly job marks it.
    await h.prisma.executorProfile.update({
      where: { userId: pro.id },
      data: { taxValidUntil: new Date(Date.now() - 1_000) },
    });
    expect((await h.api().get('/api/v1/tax/status').set(pro.auth)).body.status).toBe('EXPIRED');
    const next = (await postJob(customer).expect(201)).body.id as string;
    const refused = await h.api().post(`/api/v1/orders/${next}/accept`).set(pro.auth).expect(403);
    expect(refused.body.code).toBe('TAX_METHOD_REQUIRED');
    await h.app.get(TaxService).dailyCheck();
    const profile = await h.prisma.executorProfile.findUniqueOrThrow({ where: { userId: pro.id } });
    expect(profile.taxStatus).toBe('EXPIRED');
  });

  it('AD1: a certificate the tax system cannot confirm goes to an admin', async () => {
    const pro = await fullUser(h, doc(true), 'EXECUTOR');
    const needed = await h
      .api()
      .post('/api/v1/tax/self-employed')
      .set(pro.auth)
      .send({})
      .expect(422);
    expect(needed.body.code).toBe('TAX_CERTIFICATE_REQUIRED');

    const upload = await h
      .api()
      .post('/api/v1/uploads/presign')
      .set(pro.auth)
      .send({ purpose: 'TAX_CERTIFICATE', content_type: 'image/jpeg' })
      .expect(200);
    const queued = await h
      .api()
      .post('/api/v1/tax/self-employed')
      .set(pro.auth)
      .send({ certificate_key: upload.body.key })
      .expect(200);
    expect(queued.body).toMatchObject({
      status: 'PENDING',
      method: 'SELF_EMPLOYED',
      pending: { method: 'SELF_EMPLOYED' },
    });
    const twice = await h
      .api()
      .post('/api/v1/tax/xolis')
      .set(pro.auth)
      .send({ qr: 'xolis://x', phone: '+998901112233' })
      .expect(409);
    expect(twice.body.code).toBe('TAX_VERIFICATION_PENDING');

    // Only staff with users.manage see the queue (CLAUDE.md rule 11).
    await h.api().get('/api/v1/admin/verifications').set(pro.auth).expect(403);
    const list = await h.api().get('/api/v1/admin/verifications').set(admin.auth).expect(200);
    const item = list.body.find((row: { user: { id: string } }) => row.user.id === pro.id);
    expect(item).toMatchObject({
      method: 'SELF_EMPLOYED',
      certificate_url: expect.stringMatching(/^https:\/\//),
      user: { phone_masked: expect.stringMatching(/\*\*\*/) },
    });

    const noDate = await h
      .api()
      .post(`/api/v1/admin/verifications/${item.id}/decide`)
      .set(admin.auth)
      .send({ decision: 'APPROVE' })
      .expect(400);
    expect(noDate.body.code).toBe('VALIDATION_FAILED');
    const validUntil = new Date(Date.now() + 200 * 24 * 3_600_000).toISOString();
    await h
      .api()
      .post(`/api/v1/admin/verifications/${item.id}/decide`)
      .set(admin.auth)
      .send({ decision: 'APPROVE', valid_until: validUntil })
      .expect(200);
    const status = await h.api().get('/api/v1/tax/status').set(pro.auth).expect(200);
    expect(status.body).toMatchObject({
      status: 'VERIFIED',
      valid_until: validUntil,
      pending: null,
    });
    const again = await h
      .api()
      .post(`/api/v1/admin/verifications/${item.id}/decide`)
      .set(admin.auth)
      .send({ decision: 'REJECT', reason: 'x' })
      .expect(409);
    expect(again.body.code).toBe('TAX_ALREADY_DECIDED');

    const audit = await h.prisma.auditLog.findFirst({
      where: { action: 'tax.approve', entityId: item.id },
    });
    expect(audit?.actorId).toBe(admin.id);
  });

  it('BJ10: Paynet Xolis is checked by an admin; a rejection shows its reason', async () => {
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    await h
      .api()
      .post('/api/v1/tax/xolis')
      .set(pro.auth)
      .send({ qr: 'https://xolis.uz/pay/abc', phone: '90 111 22 33' })
      .expect(400);
    const queued = await h
      .api()
      .post('/api/v1/tax/xolis')
      .set(pro.auth)
      .send({ qr: 'https://xolis.uz/pay/abc', phone: '+998 90 111 22 33' })
      .expect(200);
    expect(queued.body).toMatchObject({ status: 'PENDING', method: 'XOLIS' });

    const pendingId = queued.body.pending.id as string;
    await h
      .api()
      .post(`/api/v1/admin/verifications/${pendingId}/decide`)
      .set(admin.auth)
      .send({ decision: 'REJECT', reason: 'QR boshqa odamniki' })
      .expect(200);
    const rejected = await h.api().get('/api/v1/tax/status').set(pro.auth).expect(200);
    expect(rejected.body).toMatchObject({
      status: 'REJECTED',
      rejected: { method: 'XOLIS', reason: 'QR boshqa odamniki' },
    });

    const retry = await h
      .api()
      .post('/api/v1/tax/xolis')
      .set(pro.auth)
      .send({ qr: 'https://xolis.uz/pay/mine', phone: '+998901112233' })
      .expect(200);
    await h
      .api()
      .post(`/api/v1/admin/verifications/${retry.body.pending.id}/decide`)
      .set(admin.auth)
      .send({ decision: 'APPROVE' })
      .expect(200);
    const profile = await h.prisma.executorProfile.findUniqueOrThrow({ where: { userId: pro.id } });
    expect(profile).toMatchObject({
      taxMethod: 'XOLIS',
      taxStatus: 'VERIFIED',
      taxValidUntil: null,
      xolisQr: 'https://xolis.uz/pay/mine',
      xolisPhone: '+998901112233',
    });
  });

  it('BY9: a cash job of a Xolis pro may be paid to the Xolis QR (stage 5 decision)', async () => {
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    await h.prisma.executorProfile.update({
      where: { userId: pro.id },
      data: { taxMethod: 'XOLIS', taxStatus: 'VERIFIED', xolisQr: 'https://xolis.uz/pay/pro' },
    });
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    // Xolis QR is not a choice when posting.
    expect((await postJob(customer, 'XOLIS_QR').expect(400)).body.code).toBe('VALIDATION_FAILED');

    const job = (await postJob(customer).expect(201)).body.id as string;
    await h.api().post(`/api/v1/orders/${job}/accept`).set(pro.auth).expect(200);
    for (const step of ['depart', 'arrive', 'start']) {
      await h.api().post(`/api/v1/orders/${job}/${step}`).set(pro.auth).expect(200);
    }
    await h
      .api()
      .post(`/api/v1/orders/${job}/finish`)
      .set(pro.auth)
      .send({ photo_keys: [] })
      .expect(200);

    const seen = await h.api().get(`/api/v1/orders/${job}`).set(customer.auth).expect(200);
    expect(seen.body.xolis_qr).toBe('https://xolis.uz/pay/pro');
    // The pro never sees it as a customer field; others never see it.
    expect((await h.api().get(`/api/v1/orders/${job}`).set(pro.auth)).body.xolis_qr).toBeNull();

    const paid = await h
      .api()
      .post(`/api/v1/orders/${job}/paid`)
      .set(customer.auth)
      .send({ via: 'XOLIS_QR' })
      .expect(200);
    expect(paid.body).toMatchObject({ status: 'COMPLETED', payment_method: 'XOLIS_QR' });
    await h.api().post(`/api/v1/orders/${job}/payment-received`).set(pro.auth).expect(200);

    // A pro without Xolis cannot be paid that way.
    const cashPro = await fullUser(h, doc(), 'EXECUTOR');
    const other = (await postJob(customer).expect(201)).body.id as string;
    await h.api().post(`/api/v1/orders/${other}/accept`).set(cashPro.auth).expect(200);
    for (const step of ['depart', 'arrive', 'start']) {
      await h.api().post(`/api/v1/orders/${other}/${step}`).set(cashPro.auth).expect(200);
    }
    await h
      .api()
      .post(`/api/v1/orders/${other}/finish`)
      .set(cashPro.auth)
      .send({ photo_keys: [] })
      .expect(200);
    const refused = await h
      .api()
      .post(`/api/v1/orders/${other}/paid`)
      .set(customer.auth)
      .send({ via: 'XOLIS_QR' })
      .expect(409);
    expect(refused.body.code).toBe('XOLIS_NOT_AVAILABLE');
  });

  it('SA5: the super admin switches methods and reminds pros without one', async () => {
    await h.api().get('/api/v1/sa/tax-methods').set(admin.auth).expect(403);
    const overview = await h.api().get('/api/v1/sa/tax-methods').set(superAdmin.auth).expect(200);
    expect(overview.body).toMatchObject({
      enabled: ['SELF_EMPLOYED', 'XOLIS'],
      counts: { SELF_EMPLOYED: expect.any(Number), XOLIS: expect.any(Number) },
      without_method: expect.any(Number),
    });
    expect(overview.body.without_method).toBeGreaterThanOrEqual(1);

    await h
      .api()
      .put('/api/v1/sa/tax-methods')
      .set(superAdmin.auth)
      .send({ enabled: ['SELF_EMPLOYED'] })
      .expect(200);
    const pro = await fullUser(h, doc(), 'EXECUTOR');
    const off = await h
      .api()
      .post('/api/v1/tax/xolis')
      .set(pro.auth)
      .send({ qr: 'xolis://q', phone: '+998901112244' })
      .expect(409);
    expect(off.body.code).toBe('TAX_METHOD_DISABLED');
    await h
      .api()
      .put('/api/v1/sa/tax-methods')
      .set(superAdmin.auth)
      .send({ enabled: ['SELF_EMPLOYED', 'XOLIS'] })
      .expect(200);

    const reminded = await h
      .api()
      .post('/api/v1/sa/tax-methods/remind')
      .set(superAdmin.auth)
      .expect(200);
    expect(reminded.body.sent).toBe(overview.body.without_method);
    const audit = await h.prisma.auditLog.count({
      where: { action: 'settings.update', entityId: 'tax_methods_enabled', actorId: superAdmin.id },
    });
    expect(audit).toBe(2);
  });
});
