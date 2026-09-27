import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { BroadcastTarget, Language } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';

const uuid = new ParseUUIDPipe();
export const BROADCAST_QUEUE = 'broadcast';
const PAGE = 30;

const text4 = z.object({
  uz: z.string().trim().min(1).max(500),
  ru: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
  tg: z.string().trim().min(1).max(500),
});
const createSchema = z.object({
  target: z.enum(['ALL', 'CUSTOMER', 'EXECUTOR']),
  title: z.object({
    uz: z.string().trim().min(1).max(100),
    ru: z.string().trim().min(1).max(100),
    en: z.string().trim().min(1).max(100),
    tg: z.string().trim().min(1).max(100),
  }),
  body: text4,
});
const listQuery = z.object({ before: z.uuid().optional() });

function whereForTarget(target: BroadcastTarget) {
  return target === 'ALL' ? {} : { activeRole: target };
}

/** `notifications.broadcast` (docs/01 §1, stage 7). */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @InjectQueue(BROADCAST_QUEUE) private readonly queue: Queue,
  ) {}

  async create(adminId: string, input: z.output<typeof createSchema>) {
    const s = await this.settings.getAll();
    const last = await this.prisma.broadcast.findFirst({ orderBy: { createdAt: 'desc' } });
    if (last) {
      const elapsedSec = (Date.now() - last.createdAt.getTime()) / 1000;
      if (elapsedSec < s.broadcast_min_interval_sec) {
        throw new AppError(
          ErrorCode.BROADCAST_RATE_LIMITED,
          { retry_after_sec: Math.ceil(s.broadcast_min_interval_sec - elapsedSec) },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const estimated = await this.prisma.user.count({ where: whereForTarget(input.target) });
    const broadcast = await this.prisma.$transaction(async (tx) => {
      const created = await tx.broadcast.create({
        data: {
          target: input.target,
          title: input.title,
          body: input.body,
          createdBy: adminId,
          recipientsCount: estimated,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'notifications.broadcast',
          entityType: 'broadcast',
          entityId: created.id,
          data: { target: input.target, title: input.title, body: input.body },
        },
        tx,
      );
      return created;
    });
    await this.queue.add('send', { broadcastId: broadcast.id });
    return {
      id: broadcast.id,
      status: broadcast.status,
      estimated_recipients: estimated,
    };
  }

  async list(before?: string) {
    const rows = await this.prisma.broadcast.findMany({
      where: before ? { id: { lt: before } } : undefined,
      orderBy: { id: 'desc' },
      take: PAGE + 1,
    });
    const page = rows.slice(0, PAGE);
    return {
      items: page.map((row) => ({
        id: row.id,
        target: row.target,
        title: row.title,
        recipients_count: row.recipientsCount,
        status: row.status,
        created_at: row.createdAt.toISOString(),
        created_by: row.createdBy,
      })),
      next: rows.length > PAGE ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(id: string) {
    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    return {
      id: row.id,
      target: row.target,
      title: row.title,
      body: row.body,
      recipients_count: row.recipientsCount,
      status: row.status,
      created_at: row.createdAt.toISOString(),
      created_by: row.createdBy,
    };
  }

  /** Worker side: pages through matching users, sends each a push in their own language. */
  async send(broadcastId: string): Promise<number> {
    const broadcast = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) return 0;
    await this.prisma.broadcast.update({ where: { id: broadcastId }, data: { status: 'SENDING' } });

    const title = broadcast.title as Record<Language, string>;
    const body = broadcast.body as Record<Language, string>;
    let sent = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.user.findMany({
        where: { ...whereForTarget(broadcast.target), ...(cursor ? { id: { gt: cursor } } : {}) },
        select: { id: true, lang: true },
        orderBy: { id: 'asc' },
        take: 500,
      });
      if (batch.length === 0) break;
      for (const user of batch) {
        await this.notifications.notifyCustom(user.id, body, {
          type: 'BROADCAST',
          title: title[user.lang],
        });
        sent += 1;
      }
      cursor = batch.at(-1)?.id;
      if (batch.length < 500) break;
    }
    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: { status: 'DONE', recipientsCount: sent },
    });
    this.logger.log(`Broadcast ${broadcastId}: sent to ${sent} user(s)`);
    return sent;
  }
}

@Controller('admin/broadcasts')
@RequireStaff('notifications.broadcast')
export class BroadcastController {
  constructor(private readonly broadcasts: BroadcastService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
  ) {
    return this.broadcasts.create(auth.userId, body);
  }

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.broadcasts.list(query.before);
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.broadcasts.get(id);
  }
}

@Processor(BROADCAST_QUEUE)
export class BroadcastProcessor extends WorkerHost {
  constructor(private readonly broadcasts: BroadcastService) {
    super();
  }

  async process(job: { data: { broadcastId: string } }): Promise<{ sent: number }> {
    const sent = await this.broadcasts.send(job.data.broadcastId);
    return { sent };
  }
}
