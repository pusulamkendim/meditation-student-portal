import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { R2ObjectStorage } from '../knowledge/storage.js';

@Controller('v1/admin/voice-media')
@UseGuards(AdminSessionGuard)
export class VoiceMediaController {
  private readonly encryption: FieldEncryption;
  private readonly storage: R2ObjectStorage;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Voice media encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.storage = new R2ObjectStorage(config);
  }

  @Get(':mediaId/audio')
  async audio(
    @Param('mediaId') mediaId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const media = await this.prisma.voiceMessageMedia.findUnique({ where: { id: mediaId } });
    if (!media?.storageKey || !media.storageEncryptionKeyId)
      throw new NotFoundException('Voice recording is not available.');

    const encrypted = await this.storage.get(this.config.R2_PRIVATE_BUCKET, media.storageKey);
    const audio = this.encryption.decryptBuffer(
      { ciphertext: encrypted, keyId: media.storageEncryptionKeyId },
      `voice-media:${media.id}`,
    );
    await this.prisma.auditLog
      .create({
        data: {
          actorType: 'ADMIN',
          actorId: request.admin!.id,
          action: 'VOICE_MEDIA_READ',
          entityType: 'VoiceMessageMedia',
          entityId: media.id,
          safeDiff: { studentId: media.studentId, byteSize: media.byteSize },
          reason: 'Voice recording playback in admin portal',
          requestId: randomUUID(),
          correlationId: randomUUID(),
        },
      })
      .catch(() => undefined);

    const range = parseByteRange(request.headers.range, audio.length);
    reply.header('accept-ranges', 'bytes');
    reply.header('cache-control', 'private, no-store');
    reply.header('content-type', safeAudioContentType(media.contentType));
    reply.header('x-content-type-options', 'nosniff');
    if (range) {
      const chunk = audio.subarray(range.start, range.end + 1);
      reply.code(206);
      reply.header('content-range', `bytes ${range.start}-${range.end}/${audio.length}`);
      reply.header('content-length', String(chunk.length));
      await reply.send(chunk);
      return;
    }
    reply.header('content-length', String(audio.length));
    await reply.send(audio);
  }
}

function safeAudioContentType(value: string | null): string {
  return value && /^audio\/[a-z0-9.+-]+$/i.test(value) ? value : 'audio/ogg';
}

function parseByteRange(value: string | undefined, size: number) {
  if (!value) return undefined;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) return undefined;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size)
    return undefined;
  return { start, end: Math.min(Math.max(start, requestedEnd), size - 1) };
}
