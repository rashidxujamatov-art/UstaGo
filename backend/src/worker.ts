import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { SettingsService } from './modules/settings/settings.service.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Fail fast: jobs depend on settings, so a missing seed should stop the worker at startup.
  await app.get(SettingsService).getAll();
  app.get(Logger).log('Worker started', 'Bootstrap');
}

await bootstrap();
