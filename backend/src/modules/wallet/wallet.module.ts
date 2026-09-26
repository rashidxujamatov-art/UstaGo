import { Controller, Get, Module } from '@nestjs/common';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { SettingsModule } from '../settings/settings.module.js';
import { LedgerService } from './ledger.service.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** Balance shown in the BY1/BJ1 header and on BJ2/BJ3. Full wallet (BJ5) in stage 3. */
  @Get()
  view(@Auth() auth: AuthContext) {
    return this.wallet.view(auth.userId);
  }
}

@Module({
  imports: [SettingsModule],
  controllers: [WalletController],
  providers: [LedgerService, WalletService],
  exports: [LedgerService, WalletService],
})
export class WalletModule {}
