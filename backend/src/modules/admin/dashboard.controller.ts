import { Controller, Get, Injectable } from '@nestjs/common';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AdminPermission } from '../staff/staff.service.js';
import { FinanceService } from '../wallet/finance.service.js';
import { OrdersModerationService } from './orders-moderation.controller.js';
import { PermissionRequestsService } from './permission-requests.controller.js';

/** AD1 "Admin paneli" (any staff member — each section is null without the permission it
 * needs, so the screen degrades instead of the whole dashboard 403ing). */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
    private readonly moderation: OrdersModerationService,
    private readonly permissionRequests: PermissionRequestsService,
  ) {}

  async view(userId: string) {
    const staff = await this.prisma.staffPermission.findUnique({ where: { userId } });
    const permissions: readonly AdminPermission[] =
      staff?.role === 'SUPER_ADMIN'
        ? ([
            'orders.moderate',
            'users.manage',
            'disputes.resolve',
            'categories.manage',
            'finance.view',
            'notifications.broadcast',
          ] as const)
        : ((staff?.permissions ?? []) as AdminPermission[]);
    const has = (p: AdminPermission) => permissions.includes(p);

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [
      verificationsPending,
      disputesOpen,
      ordersStuck,
      revenueToday,
      ordersToday,
      newUsersToday,
      myRequests,
    ] = await Promise.all([
      has('users.manage')
        ? this.prisma.taxVerification.count({ where: { status: 'PENDING' } })
        : null,
      has('disputes.resolve') ? this.prisma.order.count({ where: { status: 'DISPUTED' } }) : null,
      has('orders.moderate') ? this.moderation.stuckCount() : null,
      has('finance.view') || staff?.role === 'SUPER_ADMIN'
        ? this.finance.summary(startOfDay, new Date())
        : null,
      this.prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      this.prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
      this.permissionRequests.recentFor(userId),
    ]);

    return {
      tasks: {
        verifications_pending: verificationsPending,
        disputes_open: disputesOpen,
        orders_stuck: ordersStuck,
        support_chats: 'soon',
      },
      stats: {
        orders_today: ordersToday,
        new_users_today: newUsersToday,
        revenue_today: revenueToday ? revenueToday.platformNet.toString() : null,
      },
      my_permission_requests: myRequests,
      permissions,
    };
  }
}

@Controller('admin/dashboard')
@RequireStaff('STAFF')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  get(@Auth() auth: AuthContext) {
    return this.dashboard.view(auth.userId);
  }
}
