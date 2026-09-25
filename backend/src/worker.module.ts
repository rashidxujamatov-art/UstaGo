import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { type Env, validateEnv } from './config/env.js';
import { loggerParams } from './config/logger.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueuesModule } from './infra/queues/queues.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';

/**
 * Background worker (BullMQ). Same code base as the API, different entry point.
 * Job processors (docs/02-arxitektura.md §8) are added here stage by stage.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        loggerParams({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    PrismaModule,
    RedisModule,
    QueuesModule,
    SettingsModule,
  ],
})
export class WorkerModule {}
