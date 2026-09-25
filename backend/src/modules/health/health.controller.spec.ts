import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { HealthController } from './health.controller.js';

async function createController(database: () => Promise<unknown>, redis: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: PrismaService, useValue: { $queryRaw: database } },
      { provide: REDIS, useValue: { ping: redis } },
    ],
  }).compile();
  return moduleRef.get(HealthController);
}

function fakeResponse() {
  const res = { status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('HealthController', () => {
  it('reports ok when database and redis answer', async () => {
    const controller = await createController(
      async () => [{ '?column?': 1 }],
      async () => 'PONG',
    );
    const res = fakeResponse();

    await expect(controller.check(res as unknown as Response)).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reports degraded with 503 when a dependency fails', async () => {
    const controller = await createController(
      async () => {
        throw new Error('connection refused');
      },
      async () => 'PONG',
    );
    const res = fakeResponse();

    await expect(controller.check(res as unknown as Response)).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'up' },
    });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
