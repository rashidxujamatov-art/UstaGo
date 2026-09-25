import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';

export const REDIS = Symbol('REDIS');

@Injectable()
class RedisShutdown implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}

function createRedis(url: string): Redis {
  const logger = new Logger('Redis');
  const redis = new Redis(url);
  // Without a listener ioredis prints every reconnect failure as "Unhandled error event".
  redis.on('error', (error: Error) =>
    logger.warn(`Connection error: ${error.message || error.name}`),
  );
  return redis;
}

/** Shared ioredis client for caches, rate limits and health checks (BullMQ has its own). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createRedis(config.get('REDIS_URL', { infer: true })),
    },
    RedisShutdown,
  ],
  exports: [REDIS],
})
export class RedisModule {}
