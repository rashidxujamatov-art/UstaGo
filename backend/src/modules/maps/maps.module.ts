import { Controller, Get, Inject, Module, Param, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { RateLimiter } from '../../common/rate-limit/rate-limiter.service.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { GoogleMapsProvider } from './google-maps.provider.js';
import { MAPS_PROVIDER, type MapsProvider } from './maps.provider.js';
import { MockMapsProvider } from './mock-maps.provider.js';

const lang = z.enum(['uz', 'ru', 'en', 'tg']).default('uz');
const reverseSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  lang,
});
const autocompleteSchema = z.object({
  q: z.string().trim().min(2).max(100),
  session: z.string().min(8).max(64),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  lang,
});
const placeSchema = z.object({ session: z.string().min(8).max(64), lang });

/** Per-user request budget protecting the Google bill (not a business limit). */
const MAPS_REQUESTS_PER_MINUTE = 60;

@Controller('maps')
class MapsController {
  constructor(
    @Inject(MAPS_PROVIDER) private readonly maps: MapsProvider,
    private readonly rateLimiter: RateLimiter,
  ) {}

  /** BY6: address text for the pin position. */
  @Get('reverse-geocode')
  async reverse(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(reverseSchema)) query: z.output<typeof reverseSchema>,
  ) {
    await this.limit(auth.userId);
    return { address: await this.maps.reverseGeocode(query.lat, query.lng, query.lang) };
  }

  /** BY6 search field. */
  @Get('autocomplete')
  async autocomplete(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(autocompleteSchema)) query: z.output<typeof autocompleteSchema>,
  ) {
    await this.limit(auth.userId);
    const near =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : undefined;
    return { suggestions: await this.maps.autocomplete(query.q, query.lang, query.session, near) };
  }

  @Get('place/:id')
  async place(
    @Auth() auth: AuthContext,
    @Param('id') id: string,
    @Query(new ZodPipe(placeSchema)) query: z.output<typeof placeSchema>,
  ) {
    await this.limit(auth.userId);
    const place = await this.maps.place(id, query.lang, query.session);
    if (!place) throw new AppError(ErrorCode.NOT_FOUND, {}, 404);
    return place;
  }

  private limit(userId: string) {
    return this.rateLimiter.hit({
      key: `maps:${userId}`,
      limit: MAPS_REQUESTS_PER_MINUTE,
      windowSec: 60,
    });
  }
}

@Module({
  controllers: [MapsController],
  providers: [
    {
      provide: MAPS_PROVIDER,
      inject: [ConfigService, PrismaService],
      useFactory: (config: ConfigService<Env, true>, prisma: PrismaService): MapsProvider =>
        config.get('MAPS_PROVIDER', { infer: true }) === 'google'
          ? new GoogleMapsProvider(
              config.get('GOOGLE_MAPS_SERVER_KEY', { infer: true }) ?? '',
              async (kind) => {
                await prisma.mapsUsage.create({ data: { kind } });
              },
            )
          : new MockMapsProvider(),
    },
  ],
  exports: [MAPS_PROVIDER],
})
export class MapsModule {}
