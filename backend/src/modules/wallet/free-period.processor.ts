import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { WalletService } from './wallet.service.js';

export const WALLET_QUEUE = 'wallet';
const FREE_PERIOD_JOB = 'free-period';
/** How often expiry and reminders are checked (technical; a day has 24 chances). */
const FREE_PERIOD_EVERY_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** End of the free period (docs/01-biznes-qoidalar.md §8): reminders, then demo expiry. */
@Injectable()
export class FreePeriodService {
  private readonly logger = new Logger(FreePeriodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly wallet: WalletService,
    private readonly notifications: NotificationsService,
  ) {}

  async run(now = new Date()): Promise<{ reminded: number; expired: number }> {
    const reminded = await this.remind(now);
    const expired = await this.wallet.expireDemo(now);
    if (reminded + expired > 0) {
      this.logger.log(`Free period: ${reminded} reminder(s), demo expired for ${expired}`);
    }
    return { reminded, expired };
  }

  /**
   * Push `free_period_reminder_days` (7, 3, 1) before the end. Each day mark is sent once;
   * marks missed while the worker was down collapse into one push with the real days left.
   */
  async remind(now = new Date()): Promise<number> {
    const { free_period_reminder_days: marks } = await this.settings.getAll();
    const horizon = new Date(now.getTime() + Math.max(...marks) * DAY_MS);
    const profiles = await this.prisma.executorProfile.findMany({
      where: { freePeriodEnd: { gt: now, lte: horizon } },
      select: { userId: true, freePeriodEnd: true, remindedDays: true },
    });

    let sent = 0;
    for (const profile of profiles) {
      const daysLeft = Math.ceil((profile.freePeriodEnd.getTime() - now.getTime()) / DAY_MS);
      const due = marks.filter((mark) => daysLeft <= mark && !profile.remindedDays.includes(mark));
      if (due.length === 0) continue;
      // Conditional update: a second worker run sees the marks already taken.
      const { count } = await this.prisma.executorProfile.updateMany({
        where: { userId: profile.userId, remindedDays: { equals: profile.remindedDays } },
        data: { remindedDays: [...profile.remindedDays, ...due] },
      });
      if (count === 0) continue;
      await this.notifications.notify(profile.userId, {
        type: 'FREE_PERIOD_ENDING',
        params: { days: daysLeft },
      });
      sent += 1;
    }
    return sent;
  }
}

@Injectable()
export class FreePeriodScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(WALLET_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      FREE_PERIOD_JOB,
      { every: FREE_PERIOD_EVERY_MS },
      { name: FREE_PERIOD_JOB },
    );
  }
}

@Processor(WALLET_QUEUE)
export class FreePeriodProcessor extends WorkerHost {
  constructor(private readonly freePeriod: FreePeriodService) {
    super();
  }

  process(): Promise<{ reminded: number; expired: number }> {
    return this.freePeriod.run();
  }
}
