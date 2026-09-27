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
  Put,
} from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { RequireStaff } from '../../common/auth/staff.guard.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

const uuid = new ParseUUIDPipe();

const names4 = z.object({
  uz: z.string().trim().min(1).max(60),
  ru: z.string().trim().min(1).max(60),
  en: z.string().trim().min(1).max(60),
  tg: z.string().trim().min(1).max(60),
});
const createSchema = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/, 'lowercase, digits and dashes only'),
  names: names4,
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sort_order: z.number().int().default(0),
});
const updateSchema = z
  .object({
    names: names4.optional(),
    icon: z.string().trim().min(1).max(40).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    sort_order: z.number().int().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'at least one field is required');

/** AD3... no, AD2-adjacent: `categories.manage` (SA2's neighbour, docs/01 §1), stage 7. */
@Injectable()
export class CategoriesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async create(adminId: string, input: z.output<typeof createSchema>) {
    const existing = await this.prisma.category.findUnique({ where: { slug: input.slug } });
    if (existing) throw new AppError(ErrorCode.CATEGORY_SLUG_TAKEN, {}, HttpStatus.CONFLICT);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          slug: input.slug,
          names: input.names,
          icon: input.icon,
          color: input.color,
          sortOrder: input.sort_order,
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'category.create',
          entityType: 'category',
          entityId: category.id,
          data: { slug: input.slug },
        },
        tx,
      );
      return category;
    });
  }

  async update(adminId: string, id: string, patch: z.output<typeof updateSchema>) {
    await this.assertExists(id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({
        where: { id },
        data: {
          ...(patch.names ? { names: patch.names } : {}),
          ...(patch.icon ? { icon: patch.icon } : {}),
          ...(patch.color ? { color: patch.color } : {}),
          ...(patch.sort_order !== undefined ? { sortOrder: patch.sort_order } : {}),
        },
      });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: 'category.update',
          entityType: 'category',
          entityId: id,
          data: patch as Prisma.InputJsonValue,
        },
        tx,
      );
      return category;
    });
  }

  async setActive(adminId: string, id: string, active: boolean) {
    await this.assertExists(id);
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.update({ where: { id }, data: { active } });
      await this.audit.log(
        {
          actorId: adminId,
          actorType: 'USER',
          action: active ? 'category.activate' : 'category.deactivate',
          entityType: 'category',
          entityId: id,
        },
        tx,
      );
      return category;
    });
  }

  private async assertExists(id: string): Promise<void> {
    const found = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new AppError(ErrorCode.CATEGORY_NOT_FOUND, {}, HttpStatus.NOT_FOUND);
  }
}

@Controller('admin/categories')
@RequireStaff('categories.manage')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesAdminService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  create(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(createSchema)) body: z.output<typeof createSchema>,
  ) {
    return this.categories.create(auth.userId, body);
  }

  @Put(':id')
  update(
    @Auth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateSchema)) body: z.output<typeof updateSchema>,
  ) {
    return this.categories.update(auth.userId, id, body);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  activate(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.categories.setActive(auth.userId, id, true);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(@Auth() auth: AuthContext, @Param('id', uuid) id: string) {
    return this.categories.setActive(auth.userId, id, false);
  }
}
