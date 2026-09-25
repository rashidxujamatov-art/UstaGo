import { Module } from '@nestjs/common';
import { PublicConfigController } from './public-config.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  controllers: [PublicConfigController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
