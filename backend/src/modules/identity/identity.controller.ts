import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import { IdentityService } from './identity.service.js';

const startSchema = z.object({
  doc_type: z.enum(['ID_CARD', 'PASSPORT']),
  /** Series and number, e.g. "AD 1234567". */
  doc_number: z
    .string()
    .transform((value) => value.replace(/\s/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{2}\d{7}$/)),
  birth_date: z.iso.date(),
  /** K3b consent checkbox; required. */
  consent: z.literal(true),
  device_id: z.string().min(8).max(64),
});

const completeSchema = z.object({
  session_id: z.string().min(1).max(4096),
});

@Controller('identity/myid')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  start(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(startSchema)) body: z.output<typeof startSchema>,
  ) {
    return this.identity.startSession(
      auth.userId,
      { docType: body.doc_type, docNumber: body.doc_number, birthDate: body.birth_date },
      body.device_id,
    );
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(completeSchema)) body: z.output<typeof completeSchema>,
  ) {
    return this.identity.complete(auth.userId, body.session_id);
  }
}
