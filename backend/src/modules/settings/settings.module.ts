import { Module } from '@nestjs/common';
import { PublicConfigController } from './public-config.controller.js';
import { SaSettingsController } from './sa-settings.controller.js';
import { SettingsService } from './settings.service.js';

@Module({
  controllers: [PublicConfigController, SaSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
