import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { SettingsService } from '../settings/settings.service.js';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.provider.js';

export const UPLOAD_PURPOSES = ['ORDER_PHOTO', 'FINISH_PHOTO', 'CHAT_PHOTO'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

const CONTENT_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
export type ImageContentType = keyof typeof CONTENT_TYPES;
export const IMAGE_CONTENT_TYPES = Object.keys(CONTENT_TYPES) as ImageContentType[];

const UPLOAD_URL_TTL_SEC = 10 * 60;
const VIEW_URL_TTL_SEC = 30 * 60;

/**
 * Photo uploads (docs/02-arxitektura.md §9): the app asks for a presigned URL, uploads
 * directly, then sends the key with the order or message. The app re-encodes photos
 * before upload, which drops EXIF (including GPS).
 */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly settings: SettingsService,
  ) {}

  async presign(userId: string, purpose: UploadPurpose, contentType: ImageContentType) {
    const key = `${purpose.toLowerCase()}/${userId}/${randomUUID()}.${CONTENT_TYPES[contentType]}`;
    const { upload_max_mb: maxMb } = await this.settings.getAll();
    const { url, headers } = await this.storage.presignUpload({
      key,
      contentType,
      expiresInSec: UPLOAD_URL_TTL_SEC,
    });
    return { key, url, headers, max_bytes: maxMb * 1024 * 1024 };
  }

  /**
   * Checks that the keys were issued to this user for this purpose, the files exist and
   * are within upload_max_mb. Throws UPLOAD_INVALID otherwise.
   */
  async verify(userId: string, purpose: UploadPurpose, keys: readonly string[]): Promise<void> {
    const { upload_max_mb: maxMb } = await this.settings.getAll();
    const prefix = `${purpose.toLowerCase()}/${userId}/`;
    for (const key of keys) {
      if (!key.startsWith(prefix) || key.includes('..')) {
        throw new AppError(ErrorCode.UPLOAD_INVALID, { key });
      }
      const size = await this.storage.size(key);
      if (size === null || size > maxMb * 1024 * 1024) {
        throw new AppError(ErrorCode.UPLOAD_INVALID, { key });
      }
    }
  }

  viewUrl(key: string): Promise<string> {
    return this.storage.presignDownload(key, VIEW_URL_TTL_SEC);
  }

  viewUrls(keys: readonly string[]): Promise<string[]> {
    return Promise.all(keys.map((key) => this.viewUrl(key)));
  }
}
