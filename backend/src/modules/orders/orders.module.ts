import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChatService } from '../chat/chat.service.js';
import { SettingsModule } from '../settings/settings.module.js';
import { WalletModule } from '../wallet/wallet.module.js';
import { FeedController, OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Controller('categories')
class CategoriesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Active service types with names in all four languages (BY1, BY2). */
  @Get()
  list() {
    return this.prisma.category.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, names: true, icon: true, color: true },
    });
  }
}

@Module({
  imports: [SettingsModule, WalletModule],
  controllers: [OrdersController, FeedController, CategoriesController],
  providers: [OrdersService, ChatService],
  exports: [OrdersService],
})
export class OrdersModule {}
