import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AdminPermission } from '../../modules/staff/staff.service.js';
import { AppError } from '../errors/app-error.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { AuthenticatedRequest } from './auth.decorators.js';

const STAFF_REQUIREMENT = 'staffRequirement';

/** A permission from docs/01 §1, or SUPER_ADMIN for super-admin-only actions. */
export type StaffRequirement = AdminPermission | 'SUPER_ADMIN';

/**
 * Admin and super-admin endpoints (CLAUDE.md rule 11: the backend decides, hiding a
 * button in the app is not security). A super admin passes every permission check.
 */
export const RequireStaff = (requirement: StaffRequirement) =>
  applyDecorators(SetMetadata(STAFF_REQUIREMENT, requirement), UseGuards(StaffGuard));

@Injectable()
export class StaffGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<StaffRequirement | undefined>(
      STAFF_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;
    const staff = userId
      ? await this.prisma.staffPermission.findUnique({
          where: { userId },
          select: { role: true, permissions: true },
        })
      : null;
    const allowed =
      staff !== null &&
      (staff.role === 'SUPER_ADMIN' ||
        (requirement !== 'SUPER_ADMIN' && staff.permissions.includes(requirement)));
    if (!allowed) throw new AppError(ErrorCode.FORBIDDEN, {}, HttpStatus.FORBIDDEN);
    return true;
  }
}
