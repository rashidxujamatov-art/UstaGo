import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider } from './storage.provider.js';

export interface S3Config {
  endpoint: string;
  /** Host the phones reach; presigned URLs are signed for it. */
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

/** S3 API (MinIO locally). Files go straight from the phone to storage via presigned URLs. */
export class S3StorageProvider implements StorageProvider {
  private readonly internal: S3Client;
  private readonly signer: S3Client;

  constructor(private readonly config: S3Config) {
    const common = {
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    };
    this.internal = new S3Client({ ...common, endpoint: config.endpoint });
    this.signer = new S3Client({ ...common, endpoint: config.publicEndpoint });
  }

  async presignUpload(input: { key: string; contentType: string; expiresInSec: number }) {
    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSec },
    );
    return { url, headers: { 'Content-Type': input.contentType } };
  }

  presignDownload(key: string, expiresInSec: number): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      {
        expiresIn: expiresInSec,
      },
    );
  }

  async size(key: string): Promise<number | null> {
    try {
      const head = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return head.ContentLength ?? 0;
    } catch (error) {
      if (error instanceof NotFound || (error as { name?: string }).name === 'NotFound')
        return null;
      throw error;
    }
  }
}
