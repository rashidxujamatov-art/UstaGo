import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { RedisIoAdapter } from './infra/redis-io.adapter.js';
import { REDIS } from './infra/redis/redis.module.js';
import type { Env } from './config/env.js';

const API_PREFIX = 'api/v1';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(helmet());
  app.enableCors(corsOrigins.length > 0 ? { origin: corsOrigins } : { origin: false });
  app.setGlobalPrefix(API_PREFIX);
  app.useWebSocketAdapter(new RedisIoAdapter(app, app.get(REDIS), corsOrigins));
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  app.get(Logger).log(`API listening on http://localhost:${port}/${API_PREFIX}`, 'Bootstrap');
}

await bootstrap();
