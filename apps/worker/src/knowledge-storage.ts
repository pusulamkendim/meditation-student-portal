import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ApplicationConfig } from '@meditation/core';

export class WorkerObjectStorage {
  private readonly client?: S3Client;
  private readonly localRoot = resolve(
    process.env.KNOWLEDGE_LOCAL_STORAGE_DIR ?? '../../.data/knowledge',
  );

  constructor(private readonly config: ApplicationConfig) {
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
  async get(bucket: string, key: string): Promise<Buffer> {
    if (this.client) {
      const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) throw new Error('Storage object has no body.');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFile(join(this.localRoot, bucket, key));
  }
  async put(bucket: string, key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
      return;
    }
    const path = join(this.localRoot, bucket, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }
  async move(
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
      await this.client.send(new DeleteObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
      return;
    }
    const body = await this.get(sourceBucket, sourceKey);
    await this.put(targetBucket, targetKey, body, 'application/octet-stream');
    await unlink(join(this.localRoot, sourceBucket, sourceKey)).catch(() => undefined);
  }
  async remove(bucket: string, key: string): Promise<void> {
    if (this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      return;
    }
    await unlink(join(this.localRoot, bucket, key)).catch(() => undefined);
  }
}
