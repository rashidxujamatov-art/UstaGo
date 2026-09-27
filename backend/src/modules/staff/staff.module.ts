import { Module } from '@nestjs/common';
import { StaffService } from './staff.service.js';

/** ADMIN / SUPER_ADMIN roles (docs/01 §1). The CLI wires `StaffService` itself (`cli.ts`); this
 * module exists for the main app (stage 7's SA3 HTTP surface, `modules/admin`). */
@Module({
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
