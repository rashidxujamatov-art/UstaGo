import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { ADMIN_PERMISSIONS, StaffService } from '../staff/staff.service.js';

const uuid = new ParseUUIDPipe();
const grantSchema = z.object({
  phone: z.string().min(9).max(20),
  permissions: z.array(z.enum(ADMIN_PERMISSIONS)).default([]),
});
const permissionsSchema = z.object({ permissions: z.array(z.enum(ADMIN_PERMISSIONS)) });

/** SA3 "Rollar va ruxsatlar" (super admin only, stage 7). */
@Controller('sa/staff')
@RequireStaff('SUPER_ADMIN')
export class StaffAdminController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  grant(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(grantSchema)) body: z.output<typeof grantSchema>,
  ) {
    return this.staff.grantAdmin(auth.userId, body.phone, body.permissions);
  }

  @Put(':id/permissions')
  setPermissions(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(permissionsSchema)) body: z.output<typeof permissionsSchema>,
  ) {
    return this.staff.setPermissions(auth.userId, id, body.permissions);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revoke(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    await this.staff.revokeById(auth.userId, id);
    return { id };
  }
}
