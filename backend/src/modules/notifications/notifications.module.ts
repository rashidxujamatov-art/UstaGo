import { Global, Module } from '@nestjs/common';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { MockPushProvider, NotificationsService, PUSH_PROVIDER } from './notifications.service.js';

/** Available to the API and the worker. PUSH_PROVIDER=mock until a Firebase project exists. */
@Global()
@Module({
  providers: [
    RealtimePublisher,
    NotificationsService,
    { provide: PUSH_PROVIDER, useValue: new MockPushProvider() },
  ],
  exports: [RealtimePublisher, NotificationsService, PUSH_PROVIDER],
})
export class NotificationsModule {}
