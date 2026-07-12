import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ApplicationConfig } from '@meditation/core';

export interface ObjectStorage {
  put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, key: string): Promise<Buffer>;
  copy(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string,
  ): Promise<void>;
  remove(bucket: string, key: string): Promise<void>;
  signedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
}

/** R2-compatible storage with a filesystem fallback for local development/tests. */
export class R2ObjectStorage implements ObjectStorage {
  private readonly client?: S3Client;
  private readonly localRoot: string;

  constructor(private readonly config: ApplicationConfig) {
    this.localRoot = resolve(process.env.KNOWLEDGE_LOCAL_STORAGE_DIR ?? '../../.data/knowledge');
    if (config.R2_ENDPOINT && config.R2_ACCESS_KEY_ID && config.R2_SECRET_ACCESS_KEY) {
      this.client = new S3Client({
        endpoint: config.R2_ENDPOINT,
        region: 'auto',
        forcePathStyle: !config.R2_ENDPOINT.includes('r2.cloudflarestorage.com'),
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID,
          secretAccessKey: config.R2_SECRET_ACCESS_KEY,
        },
      });
    }
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const path = this.localPath(bucket, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    if (this.client) {
      const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error('Storage object has no body.');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(this.localPath(bucket, key));
  }

  async copy(
    sourceBucket: string,
    sourceKey: string,
    targetBucket: string,
    targetKey: string,
  ): Promise<void> {
    if (this.client) {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: targetBucket,
          Key: targetKey,
          CopySource: `${sourceBucket}/${sourceKey}`,
        }),
      );
      return;
    }
    await this.put(
      targetBucket,
      targetKey,
      await this.get(sourceBucket, sourceKey),
      'application/octet-stream',
    );
  }

  async remove(bucket: string, key: string): Promise<void> {
    if (this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return;
    }
    await unlink(this.localPath(bucket, key)).catch(() => undefined);
  }

  async signedUrl(bucket: string, key: string, expiresIn: number): Promise<string> {
    if (this.client)
      return getSignedUrl(this.client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn,
      });
    return `local://knowledge/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}?expires=${expiresIn}`;
  }

  private localPath(bucket: string, key: string): string {
    return join(this.localRoot, bucket, key);
  }
}
