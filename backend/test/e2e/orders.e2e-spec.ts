/**
 * Stage 2 end to end (docs/02-arxitektura.md §13): an order goes from PUBLISHED to
 * DONE_BY_EXECUTOR, with the acceptance rules and holds of docs/01-biznes-qoidalar.md §4,
 * the payment-confirmation blocks of §5.1, chat and expiry.
 */
import { io, type Socket } from 'socket.io-client';
import { createHarness, e2eEnabled, fullUser, type Harness, realRedis } from './harness.js';

const som = (value: number) => (BigInt(value) * 100n).toString();

describe.skipIf(!e2eEnabled)('orders flow (e2e)', () => {
  let h: Harness;
  let categoryId: string;
  let docCounter = 1_000_000;
  const doc = () => `AB${(docCounter += 1).toString().padStart(7, '0')}`;

  beforeAll(async () => {
    h = await createHarness();
    const categories = await h
      .api()
      .get('/api/v1/categories')
      .set((await fullUser(h, doc(), 'CUSTOMER')).auth);
    categoryId = categories.body[0].id as string;
  });

  afterAll(async () => {
    await h?.close();
  });

  const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  /** Posts an order; call .expect(status) like a supertest request. */
  function postOrder(
    auth: { Authorization: string },
    overrides: Partial<{
      price: string;
      payment_method: string;
      lat: number;
      lng: number;
      photo: boolean;
    }> = {},
  ) {
    return {
      expect: (status: number) =>
        sendOrder(auth, overrides).then(({ request }) => request.expect(status)),
    };
  }

  async function sendOrder(
    auth: { Authorization: string },
    overrides: Partial<{
      price: string;
      payment_method: string;
      lat: number;
      lng: number;
      photo: boolean;
    }>,
  ) {
    const photoKeys: string[] = [];
    if (overrides.photo) {
      const presign = await h
        .api()
        .post('/api/v1/uploads/presign')
        .set(auth)
        .send({ purpose: 'ORDER_PHOTO', content_type: 'image/jpeg' })
        .expect(200);
      photoKeys.push(presign.body.key as string);
    }
    // Wrapped: returning the supertest request itself would resolve it.
    return {
      request: h
        .api()
        .post('/api/v1/orders')
        .set(auth)
        .send({
          category_id: categoryId,
          title: 'Rozetka va kalitlarni almashtirish',
          description: '6 ta rozetka',
          photo_keys: photoKeys,
          address: {
            text: 'Chilonzor, 19-kvartal, 7-uy',
            lat: overrides.lat ?? 41.2856,
            lng: overrides.lng ?? 69.2034,
            entrance: '2',
            floor: '4',
            apartment: '31',
          },
          time_from: inHours(1),
          time_to: inHours(3),
          price: overrides.price ?? som(180_000),
          payment_method: overrides.payment_method ?? 'CASH',
        }),
    };
  }

  it('lists the seven categories with names in four languages', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const res = await h.api().get('/api/v1/categories').set(customer.auth).expect(200);
    expect(res.body).toHaveLength(7);
    expect(res.body[0].names).toEqual({
      uz: 'Elektrik',
      ru: 'Электрик',
      en: 'Electrician',
      tg: 'Барқчӣ',
    });
  });

  it('gives a new executor the 25 000 demo bonus once (§8)', async () => {
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const wallet = await h.api().get('/api/v1/wallet').set(executor.auth).expect(200);
    expect(wallet.body).toMatchObject({
      real: '0',
      demo: som(25_000),
      holds: '0',
      available: som(25_000),
      demo_granted: som(25_000),
      free_period: { days_left: 30, active: true },
    });

    // Switching roles back and forth does not pay it again.
    await h.api().post('/api/v1/me/role').set(executor.auth).send({ role: 'CUSTOMER' }).expect(200);
    await h.api().post('/api/v1/me/role').set(executor.auth).send({ role: 'EXECUTOR' }).expect(200);
    expect((await h.api().get('/api/v1/wallet').set(executor.auth)).body.demo).toBe(som(25_000));
  });

  it('runs an order from PUBLISHED to DONE_BY_EXECUTOR (§3)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const created = await postOrder(customer.auth, { photo: true }).expect(201);
    expect(created.body).toMatchObject({
      status: 'PUBLISHED',
      price: som(180_000),
      viewer_role: 'CUSTOMER',
    });
    expect(created.body.photos[0]).toMatch(/^https:\/\//);
    const id = created.body.id as string;

    // Feed: the address is visible before acceptance, the phone is not (§3.4).
    const feed = await h
      .api()
      .get('/api/v1/feed')
      .query({ lat: 41.29, lng: 69.2034, nearby: 'true' })
      .set(executor.auth)
      .expect(200);
    const card = feed.body.find((order: { id: string }) => order.id === id);
    expect(card).toMatchObject({ address: { text: 'Chilonzor, 19-kvartal, 7-uy', floor: '4' } });
    expect(card.customer.phone).toBeNull();
    expect(card.distance_m).toBeGreaterThan(400);
    expect(card.distance_m).toBeLessThan(600);

    // BJ2: fee 2.5% = 4 500, all from the demo bonus.
    const preview = await h
      .api()
      .get(`/api/v1/orders/${id}/accept-preview`)
      .set(executor.auth)
      .expect(200);
    expect(preview.body).toMatchObject({
      required: som(4_500),
      available: som(25_000),
      sufficient: true,
      fee: som(4_500),
      fee_demo: som(4_500),
      fee_real: '0',
    });

    const accepted = await h
      .api()
      .post(`/api/v1/orders/${id}/accept`)
      .set(executor.auth)
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: 'ACCEPTED',
      fee: { fee: som(4_500), fee_demo: som(4_500), fee_real: '0', fee_bps: 250 },
    });
    expect(accepted.body.customer.phone).toBe(customer.phone);
    const wallet = await h.api().get('/api/v1/wallet').set(executor.auth).expect(200);
    expect(wallet.body).toMatchObject({ holds: som(4_500), available: som(20_500) });

    // The customer now sees the executor and their phone.
    const seen = await h.api().get(`/api/v1/orders/${id}`).set(customer.auth).expect(200);
    expect(seen.body.executor).toMatchObject({ id: executor.id, phone: executor.phone });

    // The first executor to accept gets it (§3.3).
    const late = await fullUser(h, doc(), 'EXECUTOR');
    const taken = await h.api().post(`/api/v1/orders/${id}/accept`).set(late.auth).expect(409);
    expect(taken.body.code).toBe('ORDER_NOT_AVAILABLE');

    // Steps must follow the order; the customer cannot drive them.
    expect(
      (await h.api().post(`/api/v1/orders/${id}/start`).set(executor.auth).expect(409)).body.code,
    ).toBe('ORDER_STATUS_CONFLICT');
    await h.api().post(`/api/v1/orders/${id}/depart`).set(customer.auth).expect(404);
    for (const step of ['depart', 'arrive', 'start']) {
      await h.api().post(`/api/v1/orders/${id}/${step}`).set(executor.auth).expect(200);
    }
    const finished = await h
      .api()
      .post(`/api/v1/orders/${id}/finish`)
      .set(executor.auth)
      .send({ photo_keys: [] })
      .expect(200);
    expect(finished.body.status).toBe('DONE_BY_EXECUTOR');
    expect(finished.body.timeline.finished_at).toBeTruthy();

    const events = await h.prisma.orderEvent.findMany({
      where: { orderId: id },
      orderBy: { at: 'asc' },
    });
    expect(events.map((event) => event.toStatus)).toEqual([
      'PUBLISHED',
      'ACCEPTED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'DONE_BY_EXECUTOR',
    ]);

    // Chat: status notes plus real messages, only between the two parties.
    await h
      .api()
      .post(`/api/v1/orders/${id}/messages`)
      .set(customer.auth)
      .send({ text: 'Rahmat!' })
      .expect(201);
    const chat = await h.api().get(`/api/v1/orders/${id}/messages`).set(executor.auth).expect(200);
    expect(
      chat.body.map(
        (m: { system_code: string | null; text: string | null }) => m.system_code ?? m.text,
      ),
    ).toEqual([
      'ORDER_ACCEPTED',
      'EXECUTOR_EN_ROUTE',
      'EXECUTOR_ARRIVED',
      'WORK_STARTED',
      'WORK_FINISHED',
      'Rahmat!',
    ]);
    await h.api().get(`/api/v1/orders/${id}/messages`).set(late.auth).expect(404);

    // §5.1: the customer cannot post again until the finished job is paid...
    const blockedCustomer = await postOrder(customer.auth).expect(409);
    expect(blockedCustomer.body).toEqual({
      code: 'ORDER_CUSTOMER_CONFIRMATION_REQUIRED',
      params: { order: finished.body.number, order_id: id },
    });
    // ...and the executor of a cash job cannot take another one (T13).
    const other = await fullUser(h, doc(), 'CUSTOMER');
    const next = await postOrder(other.auth).expect(201);
    const blockedExecutor = await h
      .api()
      .post(`/api/v1/orders/${next.body.id}/accept`)
      .set(executor.auth)
      .expect(409);
    expect(blockedExecutor.body).toEqual({
      code: 'ORDER_EXECUTOR_CONFIRMATION_REQUIRED',
      params: { order: finished.body.number, order_id: id },
    });
  });

  it('refuses a job the executor cannot cover and says how much is missing (T6, BJ3)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const order = await postOrder(customer.auth, { price: som(2_000_000) }).expect(201);
    const res = await h
      .api()
      .post(`/api/v1/orders/${order.body.id}/accept`)
      .set(executor.auth)
      .expect(400);
    expect(res.body).toEqual({
      code: 'WALLET_INSUFFICIENT_TO_ACCEPT',
      params: { shortfall: som(25_000), required: som(50_000), available: som(25_000) },
    });
  });

  it('lets the executor withdraw: the job reopens and the hold is released', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const first = await fullUser(h, doc(), 'EXECUTOR');
    const second = await fullUser(h, doc(), 'EXECUTOR');
    const order = await postOrder(customer.auth).expect(201);
    const id = order.body.id as string;

    await h.api().post(`/api/v1/orders/${id}/accept`).set(first.auth).expect(200);
    await h
      .api()
      .post(`/api/v1/orders/${id}/messages`)
      .set(first.auth)
      .send({ text: 'first chat' })
      .expect(201);
    const declined = await h.api().post(`/api/v1/orders/${id}/decline`).set(first.auth).expect(200);
    expect(declined.body).toMatchObject({ status: 'PUBLISHED', executor: null });
    expect((await h.api().get('/api/v1/wallet').set(first.auth)).body.holds).toBe('0');

    await h.api().post(`/api/v1/orders/${id}/accept`).set(second.auth).expect(200);
    const chat = await h.api().get(`/api/v1/orders/${id}/messages`).set(second.auth).expect(200);
    expect(chat.body.some((m: { text: string | null }) => m.text === 'first chat')).toBe(false);
  });

  it('asks for a reason when the customer cancels a taken job, and releases the hold', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const order = await postOrder(customer.auth).expect(201);
    const id = order.body.id as string;
    await h.api().post(`/api/v1/orders/${id}/accept`).set(executor.auth).expect(200);

    const noReason = await h
      .api()
      .post(`/api/v1/orders/${id}/cancel`)
      .set(customer.auth)
      .send({})
      .expect(400);
    expect(noReason.body.code).toBe('ORDER_CANCEL_REASON_REQUIRED');

    const cancelled = await h
      .api()
      .post(`/api/v1/orders/${id}/cancel`)
      .set(customer.auth)
      .send({ reason: 'FOUND_OTHER' })
      .expect(200);
    expect(cancelled.body).toMatchObject({
      status: 'CANCELLED',
      cancel: { reason: 'FOUND_OTHER', by_me: true },
    });
    expect((await h.api().get('/api/v1/wallet').set(executor.auth)).body.holds).toBe('0');
  });

  it('expires unclaimed jobs after their time window (§13)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const order = await postOrder(customer.auth).expect(201);
    await h.prisma.order.update({
      where: { id: order.body.id },
      data: { timeFrom: new Date(Date.now() - 7_200_000), timeTo: new Date(Date.now() - 60_000) },
    });

    const { OrdersService } = await import('../../src/modules/orders/orders.service.js');
    expect(await h.app.get(OrdersService).expireOverdue()).toBeGreaterThanOrEqual(1);

    const res = await h.api().get(`/api/v1/orders/${order.body.id}`).set(customer.auth).expect(200);
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      cancel: { reason: 'EXPIRED', by_system: true },
    });
  });

  it('checks roles and the free period before taking jobs (§4)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const asExecutor = await postOrder(executor.auth).expect(403);
    expect(asExecutor.body).toEqual({ code: 'ORDER_ROLE_REQUIRED', params: { role: 'CUSTOMER' } });

    const order = await postOrder(customer.auth).expect(201);
    const own = await fullUser(h, doc(), 'CUSTOMER');
    const ownOrder = await postOrder(own.auth).expect(201);
    await h.api().post('/api/v1/me/role').set(own.auth).send({ role: 'EXECUTOR' }).expect(200);
    expect(
      (await h.api().post(`/api/v1/orders/${ownOrder.body.id}/accept`).set(own.auth).expect(400))
        .body.code,
    ).toBe('ORDER_OWN');

    await h.prisma.executorProfile.update({
      where: { userId: executor.id },
      data: { freePeriodEnd: new Date(Date.now() - 1_000) },
    });
    const res = await h
      .api()
      .post(`/api/v1/orders/${order.body.id}/accept`)
      .set(executor.auth)
      .expect(403);
    expect(res.body.code).toBe('TAX_METHOD_REQUIRED');
  });

  it.skipIf(!realRedis)('pushes status changes to the customer over Socket.IO', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const order = await postOrder(customer.auth).expect(201);

    const socket: Socket = io(h.url, {
      path: '/api/v1/socket.io',
      auth: { token: customer.token },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const received = new Promise<{ order_id: string; status: string }>((resolve) =>
      socket.on('order.status', resolve),
    );
    await h.api().post(`/api/v1/orders/${order.body.id}/accept`).set(executor.auth).expect(200);
    await expect(received).resolves.toMatchObject({ order_id: order.body.id, status: 'ACCEPTED' });
    socket.disconnect();
  });
});
