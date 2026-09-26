import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { OrdersModule } from '../orders/orders.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { CARD_PROVIDER, type CardProvider, MockCardProvider } from './card.provider.js';
import { CardsService } from './cards.service.js';
import { ClickShopHandler } from './click.handler.js';
import { PaymeCardProvider } from './payme-card.provider.js';
import { PaymeMerchantHandler } from './payme.handler.js';
import {
  OrderPaymentsController,
  PaymentCallbacksController,
  PaymentsController,
  WalletPaymentsController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { MockPayoutProvider, PAYOUT_PROVIDER } from './payout.provider.js';
import { PAYOUTS_QUEUE, PayoutsService } from './payouts.service.js';

/** Payme, Click, saved cards and payouts (docs/02-arxitektura.md §4 `payments`, `payouts`). */
@Module({
  imports: [
    SettingsModule,
    WalletModule,
    OrdersModule,
    BullModule.registerQueue({ name: PAYOUTS_QUEUE }),
  ],
  controllers: [
    PaymentCallbacksController,
    PaymentsController,
    OrderPaymentsController,
    WalletPaymentsController,
  ],
  providers: [
    PaymentsService,
    CardsService,
    PayoutsService,
    PaymeMerchantHandler,
    ClickShopHandler,
    {
      provide: CARD_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): CardProvider =>
        config.get('CARD_PROVIDER', { infer: true }) === 'payme'
          ? new PaymeCardProvider({
              url: config.get('PAYME_SUBSCRIBE_URL', { infer: true }),
              merchantId: config.get('PAYME_MERCHANT_ID', { infer: true }) ?? '',
              key: config.get('PAYME_KEY', { infer: true }) ?? '',
            })
          : new MockCardProvider(),
    },
    { provide: PAYOUT_PROVIDER, useValue: new MockPayoutProvider() },
  ],
  exports: [PaymentsService, PayoutsService, CardsService],
})
export class PaymentsModule {}
