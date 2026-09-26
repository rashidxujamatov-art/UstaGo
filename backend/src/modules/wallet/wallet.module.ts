import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { SettingsModule } from '../settings/settings.module.js';
import { FinanceService } from './finance.service.js';
import { FreePeriodService } from './free-period.processor.js';
import { WalletHistoryService } from './history.service.js';
import { LedgerService } from './ledger.service.js';
import { SettlementService } from './settlement.service.js';
import { WalletService } from './wallet.service.js';
import { WithdrawalsService } from './withdrawals.service.js';

const historyQuery = z.object({ before: z.uuid().optional() });

@Controller('wallet')
class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly history: WalletHistoryService,
  ) {}

  /** BJ5 card and the balance in the BY1/BJ1 header. */
  @Get()
  view(@Auth() auth: AuthContext) {
    return this.wallet.view(auth.userId);
  }

  /** BJ5 "Tarix", newest first; pass `before` = the last id for the next page. */
  @Get('transactions')
  list(
    @Auth() auth: AuthContext,
    @Query(new ZodPipe(historyQuery)) query: z.output<typeof historyQuery>,
  ) {
    return this.history.history(auth.userId, query.before);
  }
}

@Controller('me')
class ReferralsController {
  constructor(private readonly history: WalletHistoryService) {}

  /** U2 "Referal dasturi". */
  @Get('referrals')
  referrals(@Auth() auth: AuthContext) {
    return this.history.referrals(auth.userId);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [WalletController, ReferralsController],
  providers: [
    LedgerService,
    WalletService,
    SettlementService,
    WithdrawalsService,
    WalletHistoryService,
    FinanceService,
    FreePeriodService,
  ],
  exports: [
    LedgerService,
    WalletService,
    SettlementService,
    WithdrawalsService,
    FinanceService,
    FreePeriodService,
  ],
})
export class WalletModule {}
