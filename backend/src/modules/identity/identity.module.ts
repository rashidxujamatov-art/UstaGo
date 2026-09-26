import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { UsersModule } from '../users/users.module.js';
import { IDENTITY_PROVIDER } from './identity.provider.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { MockIdentityProvider } from './mock-identity.provider.js';

@Module({
  imports: [SettingsModule, UsersModule],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    // IDENTITY_PROVIDER=mock is the only option until MyID issues keys; env validation
    // refuses the mock in production.
    { provide: IDENTITY_PROVIDER, useClass: MockIdentityProvider },
  ],
})
export class IdentityModule {}
