import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { haversineMeters, type LatLng } from '../../common/geo/distance.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { Env } from '../../config/env.js';
import { Prisma, type TripEndReason } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { AuditService } from '../audit/audit.service.js';
import { CONSENT_VERSION } from '../identity/identity.service.js';
import { MAPS_PROVIDER, type MapsProvider } from '../maps/maps.provider.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  deviationMeters,
  isNearDestination,
  latestPoint,
  shouldRecomputeRoute,
} from './trip-logic.js';

type Tx = Prisma.TransactionClient;

export interface PointInput {
  lat: number;
  lng: number;
  at: string;
  accuracy_m?: number;
  speed?: number;
  heading?: number;
}

export interface PointsResult {
  active: boolean;
  end_reason: TripEndReason | null;
  eta_sec: number | null;
  distance_m: number | null;
}

export interface TripView {
  status: 'NONE' | 'ACTIVE' | 'ENDED';
  position: { lat: number; lng: number; heading: number | null; at: string } | null;
  eta_sec: number | null;
  distance_m: number | null;
  end_reason: TripEndReason | null;
  started_at: string | null;
  destination: { lat: number; lng: number };
}

export interface SaMapsView {
  provider: 'mock' | 'google';
  server_key_configured: boolean;
  usage_this_month: { geocode: number; places: number; routes: number };
  settings: {
    location_interval_sec: number;
    eta_refresh_sec: number;
    route_deviation_m: number;
    auto_stop_radius_m: number;
    max_trip_minutes: number;
    track_retention_days: number;
  };
}

export type MapsSettingKey = keyof SaMapsView['settings'];

/** Parties told a trip ended, and (for CUSTOMER-only events) who to relay position/eta to. */
export interface TripParties {
  customerId: string;
  executorId: string | null;
}

const POSITION_TTL_SEC = 3_600;

/**
 * Live location while the pro is en route (docs/01-biznes-qoidalar.md §10): points come in
 * over HTTP (works from the background location task), the last one is cached in Redis,
 * every one is kept in `trip_points`, and ETA is refreshed through MapsProvider.route()
 * with the docs' throttling. Order-status transitions call in to start/end a trip; this
 * service never changes an order's status itself.
 */
@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(MAPS_PROVIDER) private readonly maps: MapsProvider,
    private readonly realtime: RealtimePublisher,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---------------------------------------------------------------- lifecycle (called by OrdersService)

  /**
   * "Yo'lga chiqdim" with sharing on (BJ11): records the LOCATION consent once per
   * version and opens a trip. A no-op if one is already active (idempotency safety).
   */
  async startTrip(
    tx: Tx,
    order: { id: string },
    executorId: string,
    sessionId: string,
  ): Promise<void> {
    const existing = await tx.trip.findFirst({
      where: { orderId: order.id, endedAt: null },
      select: { id: true },
    });
    if (existing) return;

    const deviceId = await this.deviceIdFor(tx, sessionId);
    await this.ensureLocationConsent(tx, executorId, deviceId);
    await tx.trip.create({ data: { orderId: order.id, executorId, startedAt: new Date() } });
  }

  /** Ends the order's active trip, if any, inside the caller's transaction. */
  async endTripInTx(tx: Tx, orderId: string, reason: TripEndReason): Promise<TripParties | null> {
    const trip = await tx.trip.findFirst({
      where: { orderId, endedAt: null },
      select: { id: true },
    });
    if (!trip) return null;
    await tx.trip.update({
      where: { id: trip.id },
      data: { endedAt: new Date(), endReason: reason },
    });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { customerId: true, executorId: true },
    });
    return order;
  }

  /** Clears the cached position and tells both parties, once the ending transaction committed. */
  async notifyTripEnded(
    orderId: string,
    reason: TripEndReason,
    parties: TripParties | null,
  ): Promise<void> {
    if (!parties) return;
    await this.redis.del(this.positionKey(orderId));
    this.realtime.toUsers([parties.customerId, parties.executorId], 'trip.ended', {
      order_id: orderId,
      reason,
    });
  }

  // ---------------------------------------------------------------- executor

  /** BJ11: the pro's points, sent over HTTP every location_interval_sec. */
  async submitPoints(userId: string, orderId: string, points: PointInput[]): Promise<PointsResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, executorId: true, customerId: true, lat: true, lng: true },
    });
    if (!order || order.executorId !== userId) throw this.notFound();

    const s = await this.settings.getAll();
    const destination: LatLng = { lat: order.lat, lng: order.lng };
    const latest = latestPoint(points);
    const latestLatLng: LatLng = { lat: latest.lat, lng: latest.lng };
    const now = new Date();

    // The route call (if any) happens outside the row lock: it is a slow network call and
    // must never hold `trips` locked while it runs.
    const locked = await this.prisma.$transaction(async (tx) => {
      const [trip] = await tx.$queryRaw<
        {
          id: string;
          last_route_at: Date | null;
          last_route_polyline: unknown;
          last_route_origin_lat: number | null;
          last_route_origin_lng: number | null;
          last_eta_sec: number | null;
          last_distance_m: number | null;
        }[]
      >`SELECT id, last_route_at, last_route_polyline, last_route_origin_lat, last_route_origin_lng,
                last_eta_sec, last_distance_m
         FROM trips WHERE order_id = ${orderId}::uuid AND ended_at IS NULL FOR UPDATE`;
      if (!trip) return null;

      for (const point of points) {
        await tx.$executeRaw`
          INSERT INTO trip_points (id, trip_id, at, location, accuracy_m, speed, heading)
          VALUES (
            ${randomUUID()}::uuid, ${trip.id}::uuid, ${new Date(point.at)},
            ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
            ${point.accuracy_m ?? null}, ${point.speed ?? null}, ${point.heading ?? null}
          )`;
      }

      const distanceM = Math.round(haversineMeters(latestLatLng, destination));
      if (isNearDestination(distanceM, s.auto_stop_radius_m)) {
        await tx.trip.update({
          where: { id: trip.id },
          data: { endedAt: now, endReason: 'NEAR_DESTINATION', lastDistanceM: distanceM },
        });
        const parties = await tx.order.findUniqueOrThrow({
          where: { id: orderId },
          select: { customerId: true, executorId: true },
        });
        return { ended: true as const, parties };
      }

      const polyline = parsePolyline(trip.last_route_polyline);
      const deviationM = deviationMeters(latestLatLng, {
        lastRouteAt: trip.last_route_at,
        polyline,
        origin:
          trip.last_route_origin_lat !== null && trip.last_route_origin_lng !== null
            ? { lat: trip.last_route_origin_lat, lng: trip.last_route_origin_lng }
            : null,
      });
      const recompute = shouldRecomputeRoute({
        lastRouteAt: trip.last_route_at,
        now,
        etaRefreshSec: s.eta_refresh_sec,
        deviationM,
        routeDeviationM: s.route_deviation_m,
      });
      return {
        ended: false as const,
        tripId: trip.id,
        recompute,
        etaSec: trip.last_eta_sec,
        distanceM: trip.last_distance_m,
      };
    });

    if (!locked) {
      // No active trip (already ended, or sharing never started): tell the app to stop.
      const last = await this.lastTrip(orderId);
      return {
        active: false,
        end_reason: last?.endReason ?? null,
        eta_sec: null,
        distance_m: null,
      };
    }
    if (locked.ended) {
      await this.notifyTripEnded(orderId, 'NEAR_DESTINATION', locked.parties);
      return { active: false, end_reason: 'NEAR_DESTINATION', eta_sec: null, distance_m: null };
    }

    let etaSec = locked.etaSec;
    let distanceM = locked.distanceM;
    if (locked.recompute) {
      const route = await this.maps.route(latestLatLng, destination);
      if (route) {
        etaSec = route.durationSec;
        distanceM = route.distanceM;
        await this.prisma.trip.update({
          where: { id: locked.tripId },
          data: {
            lastEtaSec: route.durationSec,
            lastDistanceM: route.distanceM,
            lastRouteAt: now,
            lastRoutePolyline: route.polyline
              ? (route.polyline.map((p) => [p.lat, p.lng]) as Prisma.InputJsonValue)
              : Prisma.DbNull,
            lastRouteOriginLat: latestLatLng.lat,
            lastRouteOriginLng: latestLatLng.lng,
          },
        });
        this.realtime.toUsers([order.customerId], 'trip.eta', {
          order_id: orderId,
          eta_sec: route.durationSec,
          distance_m: route.distanceM,
        });
      }
    }

    await this.cachePosition(orderId, {
      lat: latest.lat,
      lng: latest.lng,
      heading: latest.heading ?? null,
      at: latest.at,
    });
    this.realtime.toUsers([order.customerId], 'trip.position', {
      order_id: orderId,
      lat: latest.lat,
      lng: latest.lng,
      heading: latest.heading ?? null,
      at: latest.at,
    });

    return { active: true, end_reason: null, eta_sec: etaSec, distance_m: distanceM };
  }

  /** The pro turns sharing off (it was optional to begin with). */
  async stopSharing(userId: string, orderId: string): Promise<TripView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { executorId: true },
    });
    if (!order || order.executorId !== userId) throw this.notFound();

    const parties = await this.prisma.$transaction((tx) =>
      this.endTripInTx(tx, orderId, 'STOPPED'),
    );
    await this.notifyTripEnded(orderId, 'STOPPED', parties);
    return this.getTrip(userId, orderId);
  }

  // ---------------------------------------------------------------- admin (AD3, stage 7)

  /**
   * §10 "Saqlash": the stored track may be viewed only while resolving a dispute
   * (`disputes.resolve`), never by an admin browsing live locations. Every read is
   * audited by the caller (`DisputesService`), not here.
   */
  async adminTrack(orderId: string): Promise<{
    points: { lat: number; lng: number; at: string; accuracy_m: number | null }[];
    trip_started_at: string | null;
    trip_ended_at: string | null;
    end_reason: TripEndReason | null;
  }> {
    const trip = await this.prisma.trip.findFirst({
      where: { orderId },
      orderBy: { startedAt: 'desc' },
    });
    if (!trip) throw this.notFound();
    const points = await this.prisma.$queryRaw<
      { lat: number; lng: number; at: Date; accuracy_m: number | null }[]
    >`SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, at, accuracy_m
      FROM trip_points WHERE trip_id = ${trip.id}::uuid ORDER BY at ASC`;
    return {
      points: points.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        at: p.at.toISOString(),
        accuracy_m: p.accuracy_m,
      })),
      trip_started_at: trip.startedAt.toISOString(),
      trip_ended_at: trip.endedAt?.toISOString() ?? null,
      end_reason: trip.endReason,
    };
  }

  // ---------------------------------------------------------------- both parties

  /** BY8 / BJ11: the order's live-location state. Anyone but its two parties gets 404. */
  async getTrip(userId: string, orderId: string): Promise<TripView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, executorId: true, lat: true, lng: true },
    });
    if (!order || (order.customerId !== userId && order.executorId !== userId)) {
      throw this.notFound();
    }
    const destination = { lat: order.lat, lng: order.lng };
    const trip = await this.prisma.trip.findFirst({
      where: { orderId },
      orderBy: { startedAt: 'desc' },
    });
    if (!trip) {
      return {
        status: 'NONE',
        position: null,
        eta_sec: null,
        distance_m: null,
        end_reason: null,
        started_at: null,
        destination,
      };
    }
    const active = trip.endedAt === null;
    return {
      status: active ? 'ACTIVE' : 'ENDED',
      position: active ? await this.readPosition(orderId) : null,
      eta_sec: trip.lastEtaSec,
      distance_m: trip.lastDistanceM,
      end_reason: trip.endReason,
      started_at: trip.startedAt.toISOString(),
      destination,
    };
  }

  // ---------------------------------------------------------------- worker (docs/02 §8)

  /** Every minute: trips older than max_trip_minutes are stopped (§10). */
  async checkMaxDuration(now = new Date()): Promise<number> {
    const s = await this.settings.getAll();
    const cutoff = new Date(now.getTime() - s.max_trip_minutes * 60_000);
    const overdue = await this.prisma.trip.findMany({
      where: { endedAt: null, startedAt: { lte: cutoff } },
      select: { id: true, orderId: true },
      take: 500,
    });
    let ended = 0;
    for (const trip of overdue) {
      const parties = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.trip.updateMany({
          where: { id: trip.id, endedAt: null },
          data: { endedAt: now, endReason: 'MAX_DURATION' },
        });
        if (count === 0) return null;
        return tx.order.findUniqueOrThrow({
          where: { id: trip.orderId },
          select: { customerId: true, executorId: true },
        });
      });
      if (parties) {
        await this.notifyTripEnded(trip.orderId, 'MAX_DURATION', parties);
        ended += 1;
      }
    }
    return ended;
  }

  /** Daily: points older than track_retention_days are deleted (§10). */
  async cleanupOldPoints(now = new Date()): Promise<number> {
    const s = await this.settings.getAll();
    const cutoff = new Date(now.getTime() - s.track_retention_days * 86_400_000);
    const { count } = await this.prisma.tripPoint.deleteMany({ where: { at: { lt: cutoff } } });
    return count;
  }

  // ---------------------------------------------------------------- super admin (SA6)

  async mapsOverview(): Promise<SaMapsView> {
    const [s, usage] = await Promise.all([this.settings.getAll(), this.usageThisMonth()]);
    return {
      provider: this.config.get('MAPS_PROVIDER', { infer: true }),
      server_key_configured: Boolean(this.config.get('GOOGLE_MAPS_SERVER_KEY', { infer: true })),
      usage_this_month: usage,
      settings: {
        location_interval_sec: s.location_interval_sec,
        eta_refresh_sec: s.eta_refresh_sec,
        route_deviation_m: s.route_deviation_m,
        auto_stop_radius_m: s.auto_stop_radius_m,
        max_trip_minutes: s.max_trip_minutes,
        track_retention_days: s.track_retention_days,
      },
    };
  }

  /** SA6 "Saqlash": any subset of the map/trip settings, audited per changed key. */
  async updateMapsSettings(
    adminId: string,
    patch: Partial<Record<MapsSettingKey, number>>,
  ): Promise<SaMapsView> {
    const entries = Object.entries(patch) as [MapsSettingKey, number][];
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.setting.update({ where: { key }, data: { value, updatedBy: adminId } });
        await this.audit.log(
          {
            actorId: adminId,
            actorType: 'USER',
            action: 'settings.update',
            entityType: 'setting',
            entityId: key,
            data: { value },
          },
          tx,
        );
      }
    });
    return this.mapsOverview();
  }

  // ---------------------------------------------------------------- helpers

  private async usageThisMonth(): Promise<{ geocode: number; places: number; routes: number }> {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.prisma.mapsUsage.groupBy({
      by: ['kind'],
      where: { at: { gte: start } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(rows.map((row) => [row.kind, row._count._all]));
    return {
      geocode: counts.geocode ?? 0,
      places: (counts.autocomplete ?? 0) + (counts.place ?? 0),
      routes: counts.routes ?? 0,
    };
  }

  private async lastTrip(orderId: string) {
    return this.prisma.trip.findFirst({ where: { orderId }, orderBy: { startedAt: 'desc' } });
  }

  private async deviceIdFor(tx: Tx, sessionId: string): Promise<string> {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { device: { select: { deviceId: true } } },
    });
    return session?.device.deviceId ?? 'unknown';
  }

  /** LOCATION consent, once per version (existing `consents` table, docs/01 §10 BJ11). */
  private async ensureLocationConsent(tx: Tx, userId: string, deviceId: string): Promise<void> {
    const existing = await tx.consent.findFirst({
      where: { userId, type: 'LOCATION', version: CONSENT_VERSION },
      select: { id: true },
    });
    if (existing) return;
    await tx.consent.create({
      data: { userId, type: 'LOCATION', version: CONSENT_VERSION, deviceId },
    });
  }

  private positionKey(orderId: string): string {
    return `trip:pos:${orderId}`;
  }

  private async cachePosition(
    orderId: string,
    position: { lat: number; lng: number; heading: number | null; at: string },
  ): Promise<void> {
    await this.redis.set(
      this.positionKey(orderId),
      JSON.stringify(position),
      'EX',
      POSITION_TTL_SEC,
    );
  }

  private async readPosition(
    orderId: string,
  ): Promise<{ lat: number; lng: number; heading: number | null; at: string } | null> {
    const raw = await this.redis.get(this.positionKey(orderId));
    return raw
      ? (JSON.parse(raw) as { lat: number; lng: number; heading: number | null; at: string })
      : null;
  }

  private notFound() {
    return new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
  }
}

function parsePolyline(value: unknown): LatLng[] | null {
  if (!Array.isArray(value)) return null;
  const points: LatLng[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) return null;
    const [lat, lng] = entry as [unknown, unknown];
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    points.push({ lat, lng });
  }
  return points;
}
