import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RealtimeGateway } from './realtime.gateway.js';

/** Socket.IO endpoint of the API process (the worker only publishes through Redis). */
@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
