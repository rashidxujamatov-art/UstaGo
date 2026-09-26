import type { StorageProvider } from './storage.provider.js';

/**
 * In-memory stand-in for tests. Every presigned upload is treated as done
 * (a 100 KB file), unless the key was marked missing.
 */
export class MockStorageProvider implements StorageProvider {
  private readonly uploaded = new Map<string, number>();

  presignUpload(input: { key: string; contentType: string }) {
    this.uploaded.set(input.key, 100 * 1024);
    return Promise.resolve({
      url: `https://storage.invalid/${input.key}`,
      headers: { 'Content-Type': input.contentType },
    });
  }

  presignDownload(key: string): Promise<string> {
    return Promise.resolve(`https://storage.invalid/${key}?signed=1`);
  }

  size(key: string): Promise<number | null> {
    return Promise.resolve(this.uploaded.get(key) ?? null);
  }
}
