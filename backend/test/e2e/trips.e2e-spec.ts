/**
 * Stage 6 end to end (docs/02-arxitektura.md §13): live location while the pro is
 * "Yo'lga chiqdim" (docs/01-biznes-qoidalar.md §10) — HTTP points relayed to the customer,
 * ETA, auto stop near the destination, ending the trip on arrive/cancel/decline, and the
 * SA6 super-admin screen.
 */
import { createHarness, e2eEnabled, fullUser, type Harness } from './harness.js';

const som = (value: number) => (BigInt(value) * 100n).toString();
type User = Awaited<ReturnType<typeof fullUser>>;

describe.skipIf(!e2eEnabled)('trips / live location (e2e)', () => {
  let h: Harness;
  let categoryId: string;
  let admin: User;
  let superAdmin: User;
  let docCounter = 6_000_000;
  const doc = () => `AG${(docCounter += 1).toString().padStart(7, '0')}`;

  // Chilonzor 9-kvartal (the order's destination throughout this file).
  const DEST = { lat: 41.2856, lng: 69.2034 };
  // A few kilometers away: far enough that the mock's straight-line ETA is meaningful and
  // no auto-stop fires.
  const FAR = { lat: 41.3111, lng: 69.2797 };

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

  /** Posts and accepts a job; returns its id. The executor may then "Yo'lga chiqdim". */
  async function acceptedOrder(customer: User, executor: User): Promise<string> {
    const now = Date.now();
    const created = await h
      .api()
      .post('/api/v1/orders')
      .set(customer.auth)
      .send({
        category_id: categoryId,
        title: 'Rozetka',
        description: 'Yotoqxona',
        photo_keys: [],
        address: { text: 'Chilonzor, 9-kvartal', lat: DEST.lat, lng: DEST.lng },
        time_from: new Date(now + 3_600_000).toISOString(),
        time_to: new Date(now + 3 * 3_600_000).toISOString(),
        price: som(150_000),
        payment_method: 'CASH',
      })
      .expect(201);
    const id = created.body.id as string;
    await h.api().post(`/api/v1/orders/${id}/accept`).set(executor.auth).expect(200);
    return id;
  }

  it('shares position over HTTP → the customer reads it via GET; an outsider gets 404', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const outsider = await fullUser(h, doc(), 'CUSTOMER');
    const id = await acceptedOrder(customer, executor);

    const departed = await h
      .api()
      .post(`/api/v1/orders/${id}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);
    expect(departed.body.status).toBe('EN_ROUTE');

    // Sharing started but no point yet: ACTIVE with no position.
    const started = await h.api().get(`/api/v1/orders/${id}/trip`).set(customer.auth).expect(200);
    expect(started.body).toMatchObject({
      status: 'ACTIVE',
      position: null,
      end_reason: null,
      destination: DEST,
    });
    expect(started.body.started_at).toEqual(expect.any(String));

    // Only the executor may post points, and only for their own order.
    await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(customer.auth)
      .send({ points: [{ ...FAR, at: new Date().toISOString() }] })
      .expect(404);

    const at = new Date().toISOString();
    const posted = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...FAR, at, heading: 90, accuracy_m: 8, speed: 12 }] })
      .expect(200);
    expect(posted.body.active).toBe(true);
    expect(posted.body.end_reason).toBeNull();
    expect(posted.body.eta_sec).toBeGreaterThan(0);
    expect(posted.body.distance_m).toBeGreaterThan(1_000);

    const withPosition = await h
      .api()
      .get(`/api/v1/orders/${id}/trip`)
      .set(customer.auth)
      .expect(200);
    expect(withPosition.body).toMatchObject({
      status: 'ACTIVE',
      position: { lat: FAR.lat, lng: FAR.lng, heading: 90, at },
      eta_sec: posted.body.eta_sec,
      distance_m: posted.body.distance_m,
    });
    // The executor sees the same trip state too (both parties, §10).
    expect(
      (await h.api().get(`/api/v1/orders/${id}/trip`).set(executor.auth).expect(200)).body,
    ).toMatchObject({ status: 'ACTIVE' });
    // Anyone else gets 404, not the trip.
    await h.api().get(`/api/v1/orders/${id}/trip`).set(outsider.auth).expect(404);

    const tripRow = await h.prisma.trip.findFirstOrThrow({ where: { orderId: id } });
    const points = await h.prisma.tripPoint.findMany({ where: { tripId: tripRow.id } });
    expect(points).toHaveLength(1);
  });

  it('stops automatically within auto_stop_radius_m of the destination', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const id = await acceptedOrder(customer, executor);
    await h
      .api()
      .post(`/api/v1/orders/${id}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);

    const arrived = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...DEST, at: new Date().toISOString() }] })
      .expect(200);
    expect(arrived.body).toMatchObject({ active: false, end_reason: 'NEAR_DESTINATION' });

    // The order itself is not moved to ARRIVED by this — only "Yetib keldim" does that.
    const order = await h.api().get(`/api/v1/orders/${id}`).set(customer.auth).expect(200);
    expect(order.body.status).toBe('EN_ROUTE');

    const trip = await h.api().get(`/api/v1/orders/${id}/trip`).set(customer.auth).expect(200);
    expect(trip.body).toMatchObject({
      status: 'ENDED',
      end_reason: 'NEAR_DESTINATION',
      position: null,
    });

    // Sharing already stopped: another batch of points tells the app to stay stopped.
    const again = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...DEST, at: new Date().toISOString() }] })
      .expect(200);
    expect(again.body).toEqual({
      active: false,
      end_reason: 'NEAR_DESTINATION',
      eta_sec: null,
      distance_m: null,
    });
  });

  it('"Yetib keldim" ends the trip with reason ARRIVED', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const id = await acceptedOrder(customer, executor);
    await h
      .api()
      .post(`/api/v1/orders/${id}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);
    await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...FAR, at: new Date().toISOString() }] })
      .expect(200);

    await h.api().post(`/api/v1/orders/${id}/arrive`).set(executor.auth).expect(200);
    const trip = await h.api().get(`/api/v1/orders/${id}/trip`).set(customer.auth).expect(200);
    expect(trip.body).toMatchObject({ status: 'ENDED', end_reason: 'ARRIVED', position: null });

    // A stopped trip refuses further points (the app should have stopped sending them).
    const after = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...FAR, at: new Date().toISOString() }] })
      .expect(200);
    expect(after).toMatchObject({ body: { active: false, end_reason: 'ARRIVED' } });
  });

  it('the pro may stop sharing manually (reason STOPPED)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const id = await acceptedOrder(customer, executor);
    await h
      .api()
      .post(`/api/v1/orders/${id}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);

    await h.api().post(`/api/v1/orders/${id}/trip/stop`).set(customer.auth).expect(404);
    const stopped = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/stop`)
      .set(executor.auth)
      .expect(200);
    expect(stopped.body).toMatchObject({ status: 'ENDED', end_reason: 'STOPPED' });
  });

  it('cancelling or declining an en-route job ends its trip too', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const id = await acceptedOrder(customer, executor);
    await h
      .api()
      .post(`/api/v1/orders/${id}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);
    await h
      .api()
      .post(`/api/v1/orders/${id}/cancel`)
      .set(customer.auth)
      .send({ reason: 'FOUND_OTHER' })
      .expect(200);
    const trip = await h.api().get(`/api/v1/orders/${id}/trip`).set(executor.auth).expect(200);
    expect(trip.body).toMatchObject({ status: 'ENDED', end_reason: 'CANCELLED' });

    // Decline (executor withdraws from an en-route job): the trip ends too, and — because
    // executorId is cleared by the same update — the pro must still be told over the socket
    // even though they are no longer the order's party of record.
    const other = await acceptedOrder(customer, executor);
    await h
      .api()
      .post(`/api/v1/orders/${other}/depart`)
      .set(executor.auth)
      .send({ share_location: true })
      .expect(200);
    await h.api().post(`/api/v1/orders/${other}/decline`).set(executor.auth).expect(200);
    const declinedTrip = await h.prisma.trip.findFirstOrThrow({ where: { orderId: other } });
    expect(declinedTrip).toMatchObject({ endReason: 'DECLINED' });
    expect(declinedTrip.endedAt).not.toBeNull();
  });

  it('does not share when the pro leaves share_location off (status NONE)', async () => {
    const customer = await fullUser(h, doc(), 'CUSTOMER');
    const executor = await fullUser(h, doc(), 'EXECUTOR');
    const id = await acceptedOrder(customer, executor);

    // No body at all: share_location defaults to false.
    await h.api().post(`/api/v1/orders/${id}/depart`).set(executor.auth).expect(200);

    const trip = await h.api().get(`/api/v1/orders/${id}/trip`).set(customer.auth).expect(200);
    expect(trip.body).toEqual({
      status: 'NONE',
      position: null,
      eta_sec: null,
      distance_m: null,
      end_reason: null,
      started_at: null,
      destination: DEST,
    });

    // Points are refused as "not active" even though the pro never opted in.
    const points = await h
      .api()
      .post(`/api/v1/orders/${id}/trip/points`)
      .set(executor.auth)
      .send({ points: [{ ...FAR, at: new Date().toISOString() }] })
      .expect(200);
    expect(points).toMatchObject({ body: { active: false, end_reason: null } });
  });

  it('SA6: only the super admin reads and changes the map/trip settings, audited', async () => {
    await h.api().get('/api/v1/sa/maps').set(admin.auth).expect(403);
    const overview = await h.api().get('/api/v1/sa/maps').set(superAdmin.auth).expect(200);
    expect(overview.body).toMatchObject({
      provider: 'mock',
      server_key_configured: false,
      usage_this_month: { geocode: 0, places: 0, routes: 0 },
      settings: {
        location_interval_sec: 5,
        eta_refresh_sec: 120,
        route_deviation_m: 300,
        auto_stop_radius_m: 50,
        max_trip_minutes: 180,
        track_retention_days: 30,
      },
    });

    await h
      .api()
      .put('/api/v1/sa/maps')
      .set(admin.auth)
      .send({ auto_stop_radius_m: 75 })
      .expect(403);
    const updated = await h
      .api()
      .put('/api/v1/sa/maps')
      .set(superAdmin.auth)
      .send({ auto_stop_radius_m: 75, max_trip_minutes: 90 })
      .expect(200);
    expect(updated.body.settings).toMatchObject({ auto_stop_radius_m: 75, max_trip_minutes: 90 });

    const invalid = await h.api().put('/api/v1/sa/maps').set(superAdmin.auth).send({}).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');

    const audit = await h.prisma.auditLog.count({
      where: { action: 'settings.update', actorId: superAdmin.id, entityId: 'auto_stop_radius_m' },
    });
    expect(audit).toBe(1);

    // Restore the defaults so later tests in this file see the documented values.
    await h
      .api()
      .put('/api/v1/sa/maps')
      .set(superAdmin.auth)
      .send({ auto_stop_radius_m: 50, max_trip_minutes: 180 })
      .expect(200);
  });
});
