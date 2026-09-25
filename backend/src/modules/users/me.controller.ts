import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { UsersService } from './users.service.js';

const preferencesSchema = z
  .object({
    lang: z.enum(['uz', 'ru', 'en', 'tg']).optional(),
    theme: z.enum(['LIGHT', 'DARK', 'AUTO']).optional(),
  })
  .refine((value) => value.lang !== undefined || value.theme !== undefined);

const roleSchema = z.object({ role: z.enum(['CUSTOMER', 'EXECUTOR']) });

@Controller('me')
export class MeController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@Auth() auth: AuthContext) {
    return this.users.me(auth.userId);
  }

  @Patch()
  updatePreferences(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(preferencesSchema)) body: z.output<typeof preferencesSchema>,
  ) {
    return this.users.updatePreferences(auth.userId, body);
  }

  /** K4 and the role switch in U1. */
  @Post('role')
  @HttpCode(HttpStatus.OK)
  setRole(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(roleSchema)) body: z.output<typeof roleSchema>,
  ) {
    return this.users.setRole(auth.userId, body.role);
  }

  @Get('devices')
  devices(@Auth() auth: AuthContext) {
    return this.users.devices(auth.userId, auth.sessionId);
  }

  @Delete('devices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDevice(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.removeDevice(auth.userId, id);
  }
}
