import { Body, Controller, Global, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Auth, type AuthContext } from '../../common/auth/auth.decorators.js';
import { ZodPipe } from '../../common/validation/zod-body.pipe.js';
import type { Env } from '../../config/env.js';
import { SettingsModule } from '../settings/settings.module.js';
import { MockStorageProvider } from './mock-storage.provider.js';
import { S3StorageProvider } from './s3-storage.provider.js';
import { STORAGE_PROVIDER } from './storage.provider.js';
import { IMAGE_CONTENT_TYPES, UPLOAD_PURPOSES, UploadsService } from './uploads.service.js';

const presignSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  content_type: z.enum(IMAGE_CONTENT_TYPES as [string, ...string[]]),
});

@Controller('uploads')
class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('presign')
  @HttpCode(HttpStatus.OK)
  presign(
    @Auth() auth: AuthContext,
    @Body(new ZodPipe(presignSchema)) body: z.output<typeof presignSchema>,
  ) {
    return this.uploads.presign(
      auth.userId,
      body.purpose,
      body.content_type as (typeof IMAGE_CONTENT_TYPES)[number],
    );
  }
}

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('STORAGE_PROVIDER', { infer: true }) === 's3'
          ? new S3StorageProvider({
              endpoint: config.get('S3_ENDPOINT', { infer: true }) ?? '',
              publicEndpoint: config.get('S3_PUBLIC_ENDPOINT', { infer: true }) ?? '',
              region: config.get('S3_REGION', { infer: true }),
              bucket: config.get('S3_BUCKET', { infer: true }) ?? '',
              accessKey: config.get('S3_ACCESS_KEY', { infer: true }) ?? '',
              secretKey: config.get('S3_SECRET_KEY', { infer: true }) ?? '',
            })
          : new MockStorageProvider(),
    },
  ],
  exports: [UploadsService],
})
export class StorageModule {}
