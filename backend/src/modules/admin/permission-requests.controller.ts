import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ADMIN_PERMISSIONS } from '../staff/staff.service.js';

const uuid = new ParseUUIDPipe();
const createSchema = z.object({
  permission: z.enum(ADMIN_PERMISSIONS),
  note: z.string().trim().max(500).optional(),
});
const decideSchema = z.discriminatedUnion('approve', [
  z.object({ approve: z.literal(true) }),
  z.object({ approve: z.literal(false), reason: z.string().trim().min(1).max(500) }),
]);
const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
});

/** AD1 "Ruxsat so'rash" → SA3 inbox (stage 7). */
@Injectable()
export class PermissionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Any admin/super admin may ask (`'STAFF'`), but only for a permission they lack. */
  async create(userId: string, permission: string, note: string | undefined) {
    const staff = await this.prisma.staffPermission.findUnique({ where: { userId } });
    if (staff?.role === 'SUPER_ADMIN' || staff?.permissions.includes(permission)) {
      throw new AppError(ErrorCode.PERMISSION_REQUEST_INVALID, {}, HttpStatus.CONFLICT);
    }
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permissionRequest.create({
        data: { requestedBy: userId, permission, note: note ?? null },
      });
      await this.audit.log(
        {
          actorId: userId,
          actorType: 'USER',
          action: 'staff.permission_request',
          entityType: 'permission_request',
          entityId: created.id,
          data: { permission },
        },
        tx,
      );
      return created;
    });

    const superAdmins = await this.prisma.staffPermission.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { userId: true },
    });
    for (const sa of superAdmins) {
      await this.notifications.notify(sa.userId, { type: 'PERMISSION_REQUESTED' });
    }
    return {
      id: request.id,
      permission: request.permission,
      status: request.status,
      created_at: request.createdAt.toISOString(),
    };
  }

  async recentFor(userId: string) {
    const rows = await this.prisma.permissionRequest.findMany({
      where: { requestedBy: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      id: row.id,
      permission: row.permission,
      status: row.status,
      created_at: row.createdAt.toISOString(),
    }));
  }

  async list(status: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const rows = await this.prisma.permissionRequest.findMany({
      where: { status },
      include: { requester: { select: { id: true, identity: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      requested_by: {
        id: row.requester.id,
        first_name: row.requester.identity?.firstName ?? '',
        last_name: row.requester.identity?.lastName ?? '',
      },
      permission: row.permission,
      note: row.note,
      status: row.status,
      created_at: row.createdAt.toISOString(),
    }));
  }

  async decide(superAdminId: string, id: string, approve: boolean, reason?: string) {
    const request = await this.prisma.permissionRequest.findUnique({ where: { id } });
    if (!request) throw new AppError(ErrorCode.NOT_FOUND, {}, HttpStatus.NOT_FOUND);
    if (request.status !== 'PENDING') {
      throw new AppError(ErrorCode.PERMISSION_REQUEST_NOT_PENDING, {}, HttpStatus.CONFLICT);
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.permissionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: approve ? 'APPROVED' : 'REJECTED',
          decidedBy: superAdminId,
          decidedAt: new Date(),
          reason: approve ? null : (reason ?? null),
        },
      });
      if (count === 0) {
        throw new AppError(ErrorCode.PERMISSION_REQUEST_NOT_PENDING, {}, HttpStatus.CONFLICT);
      }
      if (approve) {
        const staff = await tx.staffPermission.findUnique({
          where: { userId: request.requestedBy },
        });
        const permissions = new Set(staff?.permissions ?? []);
        permissions.add(request.permission);
        await tx.staffPermission.upsert({
          where: { userId: request.requestedBy },
          create: { userId: request.requestedBy, role: 'ADMIN', permissions: [...permissions] },
          update: { permissions: [...permissions] },
        });
      }
      await this.audit.log(
        {
          actorId: superAdminId,
          actorType: 'USER',
          action: 'staff.permission_request_decide',
          entityType: 'permission_request',
          entityId: id,
          data: { approve, permission: request.permission },
        },
        tx,
      );
    });
    await this.notifications.notify(request.requestedBy, {
      type: approve ? 'PERMISSION_REQUEST_APPROVED' : 'PERMISSION_REQUEST_REJECTED',
    });
    return { id, status: approve ? 'APPROVED' : 'REJECTED' };
  }
}

/** AD1 "Ruxsat so'rash": any staff member, regardless of what they can already do. */
@Controller('admin/permission-requests')
@RequireStaff('STAFF')
export class AdminPermissionRequestsController {
  constructor(private readonly requests: PermissionRequestsService) {}

  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
  ) {
    return this.requests.create(auth.userId, body.permission, body.note);
  }
}

@Controller('sa/permission-requests')
@RequireStaff('SUPER_ADMIN')
export class SaPermissionRequestsController {
  constructor(private readonly requests: PermissionRequestsService) {}

  @Get()
  list(@Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>) {
    return this.requests.list(query.status);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(decideSchema)) body: z.output<typeof decideSchema>,
  ) {
    return this.requests.decide(
      auth.userId,
      id,
      body.approve,
      body.approve ? undefined : body.reason,
    );
  }
}
