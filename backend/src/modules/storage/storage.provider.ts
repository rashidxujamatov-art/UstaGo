/** Object storage adapter (docs/02-arxitektura.md §9): S3 / MinIO, or a mock in tests. */
export interface StorageProvider {
  /** URL the app PUTs the file to, with the headers it must send. */
  presignUpload(input: {
    key: string;
    contentType: string;
    expiresInSec: number;
  }): Promise<{ url: string; headers: Record<string, string> }>;
  /** Short-lived URL to show a private photo. */
  presignDownload(key: string, expiresInSec: number): Promise<string>;
  /** Size in bytes, or null when the object does not exist. */
  size(key: string): Promise<number | null>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
