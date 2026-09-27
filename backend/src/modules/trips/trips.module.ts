import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { MapsModule } from '../maps/maps.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TripsService } from './trips.service.js';

const uuid = new ParseUUIDPipe();

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  at: z.iso.datetime(),
  accuracy_m: z.number().nonnegative().optional(),
  speed: z.number().nonnegative().optional(),
  heading: z.number().min(0).max(360).optional(),
});
const pointsSchema = z.object({ points: z.array(pointSchema).min(1).max(50) });

const positiveInt = z.number().int().positive();
/** SA6: any subset of the map/trip settings, each a positive integer. */
const mapsSettingsSchema = z
  .object({
    location_interval_sec: positiveInt.optional(),
    eta_refresh_sec: positiveInt.optional(),
    route_deviation_m: positiveInt.optional(),
    auto_stop_radius_m: positiveInt.optional(),
    max_trip_minutes: positiveInt.optional(),
    track_retention_days: positiveInt.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one setting is required');

/** BJ11 and the "Usta joylashuvi" screen (docs/01 §10). */
@Controller('orders')
class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get(':id/trip')
  get(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.trips.getTrip(auth.userId, id);
  }

  /** The pro's points, sent over HTTP every location_interval_sec (works in the background). */
  @Post(':id/trip/points')
  @HttpCode(HttpStatus.OK)
  points(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(pointsSchema)) body: z.output<typeof pointsSchema>,
  ) {
    return this.trips.submitPoints(auth.userId, id, body.points);
  }

  @Post(':id/trip/stop')
  @HttpCode(HttpStatus.OK)
  stop(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.trips.stopSharing(auth.userId, id);
  }
}

/** SA6 "Xarita va joylashuv": super admin only. */
@Controller('sa/maps')
@RequireStaff('SUPER_ADMIN')
class SaMapsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  get() {
    return this.trips.mapsOverview();
  }

  @Put()
  update(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(mapsSettingsSchema)) body: z.output<typeof mapsSettingsSchema>,
  ) {
    return this.trips.updateMapsSettings(auth.userId, body);
  }
}

export const TRIPS_QUEUE = 'trips';
const MAX_DURATION_JOB = 'trip-max-duration';
const CLEANUP_JOB = 'trip-points-cleanup';
/** Check intervals (technical, per the stage-6 contract): max-duration every minute, retention cleanup daily. */
const MAX_DURATION_EVERY_MS = 60_000;
const CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TripsScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(TRIPS_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      MAX_DURATION_JOB,
      { every: MAX_DURATION_EVERY_MS },
      { name: MAX_DURATION_JOB },
    );
    await this.queue.upsertJobScheduler(
      CLEANUP_JOB,
      { every: CLEANUP_EVERY_MS },
      { name: CLEANUP_JOB },
    );
  }
}

@Processor(TRIPS_QUEUE)
export class TripsProcessor extends WorkerHost {
  private readonly logger = new Logger(TripsProcessor.name);

  constructor(private readonly trips: TripsService) {
    super();
  }

  async process(job: Job): Promise<{ count: number }> {
    if (job.name === CLEANUP_JOB) {
      const count = await this.trips.cleanupOldPoints();
      if (count > 0) this.logger.log(`Deleted ${count} old trip point(s)`);
      return { count };
    }
    const count = await this.trips.checkMaxDuration();
    if (count > 0) this.logger.log(`Stopped ${count} trip(s) over max_trip_minutes`);
    return { count };
  }
}

/** Live location (docs/01-biznes-qoidalar.md §10; docs/02 §5 `trips`/`trip_points`). */
@Module({
  imports: [SettingsModule, MapsModule],
  controllers: [TripsController, SaMapsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
