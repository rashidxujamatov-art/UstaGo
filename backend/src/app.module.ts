import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CommonModule } from './common/common.module.js';
import { AppExceptionFilter } from './common/errors/app-exception.filter.js';
import { type Env, validateEnv } from './config/env.js';
import { loggerParams } from './config/logger.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { QueuesModule } from './infra/queues/queues.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { ReferralsModule } from './modules/referrals/referrals.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { SmsModule } from './modules/sms/sms.module.js';
import { UsersModule } from './modules/users/users.module.js';

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
    CommonModule,
    AuditModule,
    SmsModule,
    SettingsModule,
    ReferralsModule,
    UsersModule,
    AuthModule,
    IdentityModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
})
export class AppModule {}
