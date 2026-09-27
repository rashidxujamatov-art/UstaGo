import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { BROADCAST_QUEUE, BroadcastController, BroadcastService } from './broadcast.controller.js';
import {
  CategoriesAdminController,
  CategoriesAdminService,
} from './categories-admin.controller.js';
import { DashboardController, DashboardService } from './dashboard.controller.js';
import {
  AdminDisputesController,
  DisputesService,
  SaDisputesController,
} from './disputes.controller.js';
import {
  SaDashboardController,
  SaFinanceController,
  FinanceAdminService,
} from './finance-admin.controller.js';
import {
  OrdersModerationController,
  OrdersModerationService,
} from './orders-moderation.controller.js';
import {
  AdminPermissionRequestsController,
  PermissionRequestsService,
  SaPermissionRequestsController,
} from './permission-requests.controller.js';
import { StaffAdminController } from './staff-admin.controller.js';
import { UsersAdminController, UsersAdminService } from './users-admin.controller.js';

/**
 * Stage 7: AD1-AD3 (admin) and SA1-SA4 (super admin) API surface — docs/01 §1, the stage 7
 * contract. `disputes.resolve`, `orders.moderate`, `users.manage`, `categories.manage`,
 * `finance.view` and `notifications.broadcast` are all `@RequireStaff`-guarded per controller;
 * `SUPER_ADMIN` passes every one of them (`staff.guard.ts`).
 */
@Module({
  imports: [
    SettingsModule,
    WalletModule,
    OrdersModule,
    TripsModule,
    StaffModule,
    BullModule.registerQueue({ name: BROADCAST_QUEUE }),
  ],
  controllers: [
    DashboardController,
    AdminPermissionRequestsController,
    SaPermissionRequestsController,
    UsersAdminController,
    AdminDisputesController,
    SaDisputesController,
    OrdersModerationController,
    CategoriesAdminController,
    BroadcastController,
    StaffAdminController,
    SaDashboardController,
    SaFinanceController,
  ],
  providers: [
    DashboardService,
    PermissionRequestsService,
    UsersAdminService,
    DisputesService,
    OrdersModerationService,
    CategoriesAdminService,
    BroadcastService,
    FinanceAdminService,
  ],
  exports: [BroadcastService],
})
export class AdminModule {}
