/**
 * Stage 7 end to end (docs/02-arxitektura.md §13): AD1-AD3 and SA1-SA4 — permission gating,
 * dispute resolution (docs/01 §5, stage 7 decision of 2026-09-27: pre-payment only, no
 * refunds), user block/unblock, categories, broadcast, settings and staff management.
 */
import { LedgerService, PLATFORM } from '../../src/modules/wallet/ledger.service.js';
import { createHarness, e2eEnabled, fullUser, type Harness } from './harness.js';

const som = (value: number) => (BigInt(value) * 100n).toString();
type User = Awaited<ReturnType<typeof fullUser>>;

describe.skipIf(!e2eEnabled)('admin / super admin (e2e, stage 7)', () => {
  let h: Harness;
  let categoryId: string;
  let admin: User;
  let superAdmin: User;
  let docCounter = 9_000_000;
  const doc = () => `AG${(docCounter += 1).toString().padStart(7, '0')}`;

  beforeAll(async () => {
    h = await createHarness();
    admin = await fullUser(h, doc(), 'CUSTOMER');
    superAdmin = await fullUser(h, doc(), 'CUSTOMER');
    await h.prisma.staffPermission.createMany({
      data: [
        {
          userId: admin.id,
          role: 'ADMIN',
          permissions: [
            'orders.moderate',
            'users.manage',
            'disputes.resolve',
            'categories.manage',
            'notifications.broadcast',
          ],
        },
        { userId: superAdmin.id, role: 'SUPER_ADMIN', permissions: [] },
      ],
    });
    const categories = await h.api().get('/api/v1/categories').set(admin.auth);
    categoryId = categories.body[0].id as string;
  });

  afterAll(async () => {
    await h?.close();
  });

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

  function postJob(customer: User, method = 'CASH', price = 100_000) {
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
        price: som(price),
        payment_method: method,
      });
  }

  /** Accepts, then walks the job to DONE_BY_EXECUTOR ("Ishni tugatdim"). */
  async function toDoneByExecutor(pro: User, jobId: string) {
    await h.api().post(`/api/v1/orders/${jobId}/accept`).set(pro.auth).expect(200);
    for (const step of ['depart', 'arrive', 'start']) {
      await h.api().post(`/api/v1/orders/${jobId}/${step}`).set(pro.auth).expect(200);
    }
    await h
      .api()
      .post(`/api/v1/orders/${jobId}/finish`)
      .set(pro.auth)
      .send({ photo_keys: [] })
      .expect(200);
  }

  describe('permission gating', () => {
    it('an admin without the right permission gets 403; a super admin always passes', async () => {
      const bare = await fullUser(h, doc(), 'CUSTOMER');
      await h.prisma.staffPermission.create({
        data: { userId: bare.id, role: 'ADMIN', permissions: [] },
      });

      await h.api().get('/api/v1/admin/users').set(bare.auth).expect(403);
      await h.api().get('/api/v1/admin/users').set(admin.auth).expect(200);
      await h.api().get('/api/v1/admin/users').set(superAdmin.auth).expect(200);

      // A plain user (no staff row at all) is refused too.
      const plain = await fullUser(h, doc(), 'CUSTOMER');
      await h.api().get('/api/v1/admin/dashboard').set(plain.auth).expect(403);
      // 'STAFF' passes for any staff row, permission-less admins included.
      await h.api().get('/api/v1/admin/dashboard').set(bare.auth).expect(200);
    });
  });

  describe('disputes: cash', () => {
    it('FULL executes at once — the pro is paid, the fee is charged', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const jobId = (await postJob(customer).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/payment-not-received`)
        .set(pro.auth)
        .send({})
        .expect(200);

      const decided = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'FULL' })
        .expect(200);
      expect(decided.body.dispute).toMatchObject({ decision: 'FULL', approval: 'APPROVED' });
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('PAID');
      expect(order.paidAt).not.toBeNull();
      const settled = await h.prisma.walletHold.findFirst({ where: { orderId: jobId } });
      expect(settled?.status).toBe('SETTLED');
    });

    it('CANCEL needs super-admin approval; a plain admin only proposes it', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const jobId = (await postJob(customer).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/payment-not-received`)
        .set(pro.auth)
        .send({})
        .expect(200);

      const notAllowed = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'PARTIAL' })
        .expect(409);
      expect(notAllowed.body.code).toBe('DISPUTE_DECISION_NOT_ALLOWED');

      const proposed = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'CANCEL' })
        .expect(200);
      expect(proposed.body.dispute).toMatchObject({ decision: 'CANCEL', approval: 'PENDING' });
      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(
        'DISPUTED',
      );

      const approveWrongRole = await h
        .api()
        .post(`/api/v1/sa/disputes/${jobId}/approve`)
        .set(admin.auth)
        .expect(403);
      expect(approveWrongRole.body.code).toBe('FORBIDDEN');
      await h.api().post(`/api/v1/sa/disputes/${jobId}/approve`).set(superAdmin.auth).expect(200);
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('CANCELLED');
      expect(order.cancelReason).toBe('DISPUTE');
      const hold = await h.prisma.walletHold.findFirst({ where: { orderId: jobId } });
      expect(hold?.status).toBe('RELEASED');

      // Already decided — cannot be re-decided.
      const again = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'FULL' })
        .expect(409);
      expect(again.body.code).toBe('DISPUTE_NOT_DISPUTED');
    });

    it('a super admin deciding directly executes at once, recorded as approved', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const jobId = (await postJob(customer).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/payment-not-received`)
        .set(pro.auth)
        .send({})
        .expect(200);

      await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(superAdmin.auth)
        .send({ decision: 'CANCEL' })
        .expect(200);
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('CANCELLED');
      expect(order.disputeApproval).toBe('APPROVED');
      expect(order.disputeApprovedBy).toBe(superAdmin.id);
      expect(order.disputeDecidedBy).toBe(superAdmin.id);
    });
  });

  describe('disputes: online (BALANCE) — pre-payment only, no refunds', () => {
    it('PARTIAL shrinks the price/fee/hold; the customer is blocked from new orders until they pay it', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      await creditReal(customer.id, 1_000_000);
      const jobId = (await postJob(customer, 'BALANCE', 200_000).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h.api().post(`/api/v1/orders/${jobId}/dispute`).set(customer.auth).send({}).expect(200);

      const before = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(before.fee?.toString()).toBe(som(5_000)); // fee_bps 250 of 200 000 = 5 000

      await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'PARTIAL' })
        .expect(200);
      let order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('DISPUTED');
      expect(order.disputeApproval).toBe('PENDING');

      await h.api().post(`/api/v1/sa/disputes/${jobId}/approve`).set(superAdmin.auth).expect(200);
      order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('DONE_BY_EXECUTOR');
      expect(order.price.toString()).toBe(som(100_000)); // 200 000 × 5000/10000
      expect(order.disputeOriginalPrice?.toString()).toBe(som(200_000));
      expect(order.fee?.toString()).toBe(som(2_500)); // 100 000 × 250/10000
      // The new executor's free demo bonus (25 000) covers the whole (now smaller) fee, same
      // as it covered the original one — only the total held has to shrink to match.
      const hold = await h.prisma.walletHold.findFirstOrThrow({
        where: { orderId: jobId, status: 'ACTIVE' },
      });
      expect((hold.amountDemo + hold.amountReal).toString()).toBe(som(2_500));

      // §5.1-style block: an unpaid, reopened order stops a new one, same as the ordinary flow.
      const blocked = await postJob(customer).expect(409);
      expect(blocked.body.code).toBe('ORDER_CUSTOMER_CONFIRMATION_REQUIRED');

      const beforeReal = (await h.api().get('/api/v1/wallet').set(customer.auth)).body
        .real as string;
      await h.api().post(`/api/v1/orders/${jobId}/pay`).set(customer.auth).send({}).expect(200);
      const afterReal = (await h.api().get('/api/v1/wallet').set(customer.auth)).body
        .real as string;
      expect(BigInt(beforeReal) - BigInt(afterReal)).toBe(BigInt(som(100_000)));
      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(
        'PAID',
      );

      // The block is lifted now.
      await postJob(customer).expect(201);
    });

    it('FULL reopens the order at the original price (no approval needed)', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      await creditReal(customer.id, 1_000_000);
      const jobId = (await postJob(customer, 'BALANCE', 150_000).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h.api().post(`/api/v1/orders/${jobId}/dispute`).set(customer.auth).send({}).expect(200);

      const decided = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'FULL' })
        .expect(200);
      expect(decided.body.dispute).toMatchObject({ decision: 'FULL', approval: 'APPROVED' });
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('DONE_BY_EXECUTOR');
      expect(order.price.toString()).toBe(som(150_000));

      await h.api().post(`/api/v1/orders/${jobId}/pay`).set(customer.auth).send({}).expect(200);
      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(
        'PAID',
      );
    });

    it('CANCEL releases the hold — nothing was ever charged', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      await creditReal(customer.id, 1_000_000);
      const jobId = (await postJob(customer, 'BALANCE', 80_000).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h.api().post(`/api/v1/orders/${jobId}/dispute`).set(customer.auth).send({}).expect(200);

      await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'CANCEL' })
        .expect(200);
      await h.api().post(`/api/v1/sa/disputes/${jobId}/approve`).set(superAdmin.auth).expect(200);
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('CANCELLED');
      const hold = await h.prisma.walletHold.findFirst({ where: { orderId: jobId } });
      expect(hold?.status).toBe('RELEASED');
    });

    it('a rejected proposal clears back to an open dispute for a fresh decision', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      await creditReal(customer.id, 1_000_000);
      const jobId = (await postJob(customer, 'BALANCE', 60_000).expect(201)).body.id as string;
      await toDoneByExecutor(pro, jobId);
      await h.api().post(`/api/v1/orders/${jobId}/dispute`).set(customer.auth).send({}).expect(200);
      await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'CANCEL' })
        .expect(200);

      const rejected = await h
        .api()
        .post(`/api/v1/sa/disputes/${jobId}/reject`)
        .set(superAdmin.auth)
        .send({ reason: 'Ustaning ishi bor edi' })
        .expect(200);
      expect(rejected.body.dispute).toMatchObject({ decision: null, approval: 'REJECTED' });
      expect((await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(
        'DISPUTED',
      );

      const redecided = await h
        .api()
        .post(`/api/v1/admin/disputes/${jobId}/decide`)
        .set(admin.auth)
        .send({ decision: 'FULL' })
        .expect(200);
      expect(redecided.body.dispute.decision).toBe('FULL');
    });
  });

  describe('disputes: stored track', () => {
    it('is visible only through disputes.resolve, and every read is audited', async () => {
      const pro = await fullUser(h, doc(), 'EXECUTOR');
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const jobId = (await postJob(customer).expect(201)).body.id as string;
      await h.api().post(`/api/v1/orders/${jobId}/accept`).set(pro.auth).expect(200);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/depart`)
        .set(pro.auth)
        .send({ share_location: true })
        .expect(200);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/trip/points`)
        .set(pro.auth)
        .send({ points: [{ lat: 41.28, lng: 69.2, at: new Date().toISOString() }] })
        .expect(200);
      for (const step of ['arrive', 'start'])
        await h.api().post(`/api/v1/orders/${jobId}/${step}`).set(pro.auth).expect(200);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/finish`)
        .set(pro.auth)
        .send({ photo_keys: [] })
        .expect(200);
      await h
        .api()
        .post(`/api/v1/orders/${jobId}/payment-not-received`)
        .set(pro.auth)
        .send({})
        .expect(200);

      const bare = await fullUser(h, doc(), 'CUSTOMER');
      await h.prisma.staffPermission.create({
        data: { userId: bare.id, role: 'ADMIN', permissions: ['orders.moderate'] },
      });
      await h.api().get(`/api/v1/admin/disputes/${jobId}/track`).set(bare.auth).expect(403);

      const track = await h
        .api()
        .get(`/api/v1/admin/disputes/${jobId}/track`)
        .set(admin.auth)
        .expect(200);
      expect(track.body.points.length).toBeGreaterThanOrEqual(1);
      const logged = await h.prisma.auditLog.findFirst({
        where: { action: 'dispute.track_view', entityId: jobId, actorId: admin.id },
      });
      expect(logged).not.toBeNull();
    });
  });

  describe('AD2 users: block / unblock', () => {
    it('blocks and unblocks, and a blocked customer cannot post a job', async () => {
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      await h
        .api()
        .post(`/api/v1/admin/users/${customer.id}/block`)
        .set(admin.auth)
        .send({})
        .expect(400);
      await h
        .api()
        .post(`/api/v1/admin/users/${customer.id}/block`)
        .set(admin.auth)
        .send({ reason: 'Shubhali faoliyat' })
        .expect(200);
      expect((await h.prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).status).toBe(
        'BLOCKED',
      );

      const blocked = await postJob(customer).expect(403);
      expect(blocked.body.code).toBe('USER_BLOCKED');

      const twice = await h
        .api()
        .post(`/api/v1/admin/users/${customer.id}/block`)
        .set(admin.auth)
        .send({ reason: 'x' })
        .expect(409);
      expect(twice.body.code).toBe('USER_ALREADY_BLOCKED');

      await h.api().post(`/api/v1/admin/users/${customer.id}/unblock`).set(admin.auth).expect(200);
      expect((await h.prisma.user.findUniqueOrThrow({ where: { id: customer.id } })).status).toBe(
        'ACTIVE',
      );
      await postJob(customer).expect(201);
    });
  });

  describe('categories.manage', () => {
    it('creates, updates, deactivates and reactivates a category', async () => {
      const created = await h
        .api()
        .post('/api/v1/admin/categories')
        .set(admin.auth)
        .send({
          slug: `test-cat-${Date.now()}`,
          names: { uz: 'Test', ru: 'Тест', en: 'Test', tg: 'Тест' },
          icon: 'wrench',
          color: '#2461C2',
        })
        .expect(201);
      const id = created.body.id as string;

      const dup = await h
        .api()
        .post('/api/v1/admin/categories')
        .set(admin.auth)
        .send({ slug: created.body.slug, names: created.body.names, icon: 'x', color: '#000000' })
        .expect(409);
      expect(dup.body.code).toBe('CATEGORY_SLUG_TAKEN');

      await h
        .api()
        .put(`/api/v1/admin/categories/${id}`)
        .set(admin.auth)
        .send({ icon: 'zap' })
        .expect(200);
      await h.api().post(`/api/v1/admin/categories/${id}/deactivate`).set(admin.auth).expect(200);
      const publicList = await h.api().get('/api/v1/categories').set(admin.auth);
      expect(publicList.body.some((c: { id: string }) => c.id === id)).toBe(false);

      await h.api().post(`/api/v1/admin/categories/${id}/activate`).set(admin.auth).expect(200);
      const again = await h.api().get('/api/v1/categories').set(admin.auth);
      expect(again.body.some((c: { id: string }) => c.id === id)).toBe(true);
    });
  });

  describe('notifications.broadcast', () => {
    it('rate-limits a second broadcast sent too soon', async () => {
      const first = await h
        .api()
        .post('/api/v1/admin/broadcasts')
        .set(admin.auth)
        .send({
          target: 'ALL',
          title: { uz: 'Yangilik', ru: 'Новость', en: 'News', tg: 'Хабар' },
          body: { uz: 'Salom', ru: 'Привет', en: 'Hello', tg: 'Салом' },
        })
        .expect(202);
      expect(first.body).toMatchObject({
        status: 'QUEUED',
        estimated_recipients: expect.any(Number),
      });

      const second = await h
        .api()
        .post('/api/v1/admin/broadcasts')
        .set(admin.auth)
        .send({
          target: 'ALL',
          title: { uz: 'Yangilik 2', ru: 'Новость 2', en: 'News 2', tg: 'Хабар 2' },
          body: { uz: 'Salom 2', ru: 'Привет 2', en: 'Hello 2', tg: 'Салом 2' },
        })
        .expect(429);
      expect(second.body.code).toBe('BROADCAST_RATE_LIMITED');

      const list = await h.api().get('/api/v1/admin/broadcasts').set(admin.auth).expect(200);
      expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('SA2 settings', () => {
    it('updates a partial patch, audits the change, and enforces the cross-field rate rule', async () => {
      await h.api().get('/api/v1/sa/settings').set(admin.auth).expect(403);
      const before = await h.api().get('/api/v1/sa/settings').set(superAdmin.auth).expect(200);
      expect(before.body.rates.dispute_partial_bps).toBe(5_000);

      await h
        .api()
        .put('/api/v1/sa/settings')
        .set(superAdmin.auth)
        .send({ dispute_partial_bps: 4_000 })
        .expect(200);
      const after = await h.api().get('/api/v1/sa/settings').set(superAdmin.auth).expect(200);
      expect(after.body.rates.dispute_partial_bps).toBe(4_000);
      const audited = await h.prisma.auditLog.findFirst({
        where: {
          action: 'settings.update',
          entityId: 'dispute_partial_bps',
          actorId: superAdmin.id,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audited).not.toBeNull();
      // Restore for the other tests in this file.
      await h
        .api()
        .put('/api/v1/sa/settings')
        .set(superAdmin.auth)
        .send({ dispute_partial_bps: 5_000 })
        .expect(200);

      const invalid = await h
        .api()
        .put('/api/v1/sa/settings')
        .set(superAdmin.auth)
        .send({ ref_l1_bps: 200, ref_l2_bps: 100 })
        .expect(400);
      expect(invalid.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('SA3 staff', () => {
    it('grants, adjusts and revokes an admin by phone', async () => {
      const candidate = await fullUser(h, doc(), 'CUSTOMER');
      const unverifiedPhone = `+998${Date.now().toString().slice(-9)}`;

      const noAccount = await h
        .api()
        .post('/api/v1/sa/staff')
        .set(superAdmin.auth)
        .send({ phone: unverifiedPhone, permissions: [] })
        .expect(404);
      expect(noAccount.body.code).toBe('STAFF_USER_NOT_FOUND');

      const granted = await h
        .api()
        .post('/api/v1/sa/staff')
        .set(superAdmin.auth)
        .send({ phone: candidate.phone, permissions: ['finance.view'] })
        .expect(201);
      expect(granted.body).toMatchObject({ role: 'ADMIN', permissions: ['finance.view'] });

      const list = await h.api().get('/api/v1/sa/staff').set(superAdmin.auth).expect(200);
      expect(list.body.some((s: { id: string }) => s.id === candidate.id)).toBe(true);

      await h
        .api()
        .put(`/api/v1/sa/staff/${candidate.id}/permissions`)
        .set(superAdmin.auth)
        .send({ permissions: ['finance.view', 'orders.moderate'] })
        .expect(200);

      const revokeSuper = await h
        .api()
        .post(`/api/v1/sa/staff/${superAdmin.id}/revoke`)
        .set(superAdmin.auth)
        .expect(409);
      expect(revokeSuper.body.code).toBe('STAFF_ALREADY_SUPER_ADMIN');

      await h
        .api()
        .post(`/api/v1/sa/staff/${candidate.id}/revoke`)
        .set(superAdmin.auth)
        .expect(200);
      const after = await h.api().get('/api/v1/sa/staff').set(superAdmin.auth).expect(200);
      expect(after.body.some((s: { id: string }) => s.id === candidate.id)).toBe(false);
    });
  });

  describe('AD1 permission requests', () => {
    it('an admin asks, a super admin approves, the permission is granted', async () => {
      const requester = await fullUser(h, doc(), 'CUSTOMER');
      await h.prisma.staffPermission.create({
        data: { userId: requester.id, role: 'ADMIN', permissions: [] },
      });

      const request = await h
        .api()
        .post('/api/v1/admin/permission-requests')
        .set(requester.auth)
        .send({ permission: 'finance.view' })
        .expect(201);
      expect(request.body.status).toBe('PENDING');

      const pending = await h
        .api()
        .get('/api/v1/sa/permission-requests')
        .set(superAdmin.auth)
        .expect(200);
      expect(pending.body.some((r: { id: string }) => r.id === request.body.id)).toBe(true);

      await h
        .api()
        .post(`/api/v1/sa/permission-requests/${request.body.id}/decide`)
        .set(superAdmin.auth)
        .send({ approve: true })
        .expect(200);
      const staff = await h.prisma.staffPermission.findUniqueOrThrow({
        where: { userId: requester.id },
      });
      expect(staff.permissions).toContain('finance.view');
    });
  });

  describe('orders moderation', () => {
    it('an admin cancels a live order with a reason', async () => {
      const customer = await fullUser(h, doc(), 'CUSTOMER');
      const jobId = (await postJob(customer).expect(201)).body.id as string;
      await h
        .api()
        .post(`/api/v1/admin/orders/${jobId}/cancel`)
        .set(admin.auth)
        .send({ reason: 'Noto‘g‘ri manzil' })
        .expect(200);
      const order = await h.prisma.order.findUniqueOrThrow({ where: { id: jobId } });
      expect(order.status).toBe('CANCELLED');
      expect(order.cancelReason).toBe('ADMIN');
    });
  });
});
