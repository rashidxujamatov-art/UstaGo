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
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { Env } from '../../config/env.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StorageModule } from '../storage/storage.module.js';
import {
  ManualTaxStatusProvider,
  MockTaxStatusProvider,
  TAX_STATUS_PROVIDER,
} from './tax-status.provider.js';
import { TaxService } from './tax.service.js';

const uuid = new ParseUUIDPipe();
const selfEmployedSchema = z.object({ certificate_key: z.string().max(300).optional() });
const xolisSchema = z.object({
  qr: z.string().trim().min(1).max(1000),
  phone: z.string().min(9).max(20),
});
const remindersSchema = z.object({ enabled: z.boolean() });
const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), valid_until: z.iso.datetime().optional() }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().trim().min(1).max(500) }),
]);
const methodsSchema = z.object({ enabled: z.array(z.enum(['SELF_EMPLOYED', 'XOLIS'])).max(2) });

/** BJ8-BJ10 and the "Soliq holati" screen. */
@Controller('tax')
class TaxController {
  constructor(private readonly tax: TaxService) {}

  @Get('status')
  status(@Auth() auth: AuthContext) {
    return this.tax.status(auth.userId);
  }

  @Post('self-employed')
  @HttpCode(HttpStatus.OK)
  selfEmployed(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(selfEmployedSchema)) body: z.output<typeof selfEmployedSchema>,
  ) {
    return this.tax.selfEmployed(auth.userId, body.certificate_key);
  }

  @Post('xolis')
  @HttpCode(HttpStatus.OK)
  xolis(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(xolisSchema)) body: z.output<typeof xolisSchema>,
  ) {
    return this.tax.connectXolis(auth.userId, body);
  }

  @Put('reminders')
  reminders(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(remindersSchema)) body: z.output<typeof remindersSchema>,
  ) {
    return this.tax.setReminders(auth.userId, body.enabled);
  }
}

/** AD1 "Hujjat murojaatlari": admins with users.manage (docs/01 §1). */
@Controller('admin/verifications')
@RequireStaff('users.manage')
class VerificationsController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  list() {
    return this.tax.queueList();
  }

  @Get(':id')
  get(@Param('id', uuid) id: string) {
    return this.tax.queueItem(id);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(decisionSchema)) body: z.output<typeof decisionSchema>,
  ) {
    return this.tax.decide(
      auth.userId,
      id,
      body.decision === 'APPROVE'
        ? { approve: true, validUntil: body.valid_until ? new Date(body.valid_until) : undefined }
        : { approve: false, reason: body.reason },
    );
  }
}

/** SA5 "Soliq usullari": super admin only. */
@Controller('sa/tax-methods')
@RequireStaff('SUPER_ADMIN')
class TaxMethodsController {
  constructor(private readonly tax: TaxService) {}

  @Get()
  overview() {
    return this.tax.methodsOverview();
  }

  @Put()
  update(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(methodsSchema)) body: z.output<typeof methodsSchema>,
  ) {
    return this.tax.setMethodsEnabled(auth.userId, body.enabled);
  }

  @Post('remind')
  @HttpCode(HttpStatus.OK)
  remind(@Auth() auth: AuthContext) {
    return this.tax.remindWithoutMethod(auth.userId);
  }
}

export const TAX_QUEUE = 'tax';
const TAX_CHECK_JOB = 'tax-status-check';
/** docs/02 §8: reminders and expiry are checked hourly (a day has 24 chances). */
const TAX_CHECK_EVERY_MS = 60 * 60 * 1000;

@Injectable()
export class TaxScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(TAX_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      TAX_CHECK_JOB,
      { every: TAX_CHECK_EVERY_MS },
      { name: TAX_CHECK_JOB },
    );
  }
}

@Processor(TAX_QUEUE)
export class TaxProcessor extends WorkerHost {
  private readonly logger = new Logger(TaxProcessor.name);

  constructor(private readonly tax: TaxService) {
    super();
  }

  async process() {
    const result = await this.tax.dailyCheck();
    if (result.ended + result.reminded + result.expired > 0) {
      this.logger.log(
        `Tax: ${result.ended} free-month push(es), ${result.reminded} reminder(s), ${result.expired} expired`,
      );
    }
    return result;
  }
}

/** Tax methods of executors (docs/01-biznes-qoidalar.md §9; docs/02 §4 `tax`). */
@Module({
  imports: [SettingsModule, StorageModule],
  controllers: [TaxController, VerificationsController, TaxMethodsController],
  providers: [
    TaxService,
    {
      provide: TAX_STATUS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('TAX_PROVIDER', { infer: true }) === 'manual'
          ? new ManualTaxStatusProvider()
          : new MockTaxStatusProvider(),
    },
  ],
  exports: [TaxService],
})
export class TaxModule {}
