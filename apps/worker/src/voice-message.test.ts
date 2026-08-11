import { FieldEncryption, FakeClock, type ApplicationConfig } from '@meditation/core';
import { ConsentScope, ConsentStatus, VoiceMediaStatus } from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import { VoiceMessageProcessor } from './voice-message.js';

const clock = new FakeClock('2026-08-11T09:00:00.000Z');

describe('VoiceMessageProcessor', () => {
  it('keeps the original recording and attaches it to the replied practice without AI consent', async () => {
    const key = Buffer.alloc(32, 7);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const protectedFileId = encryption.encrypt('telegram-file-id', 'inbox-dedupe:media');
    const original = Buffer.from([79, 103, 103, 83, 1, 2, 3, 4]);
    let media = {
      id: 'media-1',
      status: VoiceMediaStatus.RECEIVED,
      storageKey: null as string | null,
      storageEncryptionKeyId: null as string | null,
      durationSeconds: null as number | null,
    };
    const put = vi.fn().mockResolvedValue(undefined);
    const reflectionCreate = vi.fn().mockResolvedValue({ id: 'reflection-1' });
    const voiceUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      media = { ...media, ...data } as typeof media;
      return media;
    });
    const tx = {
      practiceReflection: { create: reflectionCreate },
      conversationContextResolution: { upsert: vi.fn().mockResolvedValue({}) },
      standardMessageVersion: { findMany: vi.fn().mockResolvedValue([]) },
      inboundResponseOwnership: { upsert: vi.fn().mockResolvedValue({}) },
      inboxEvent: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      inboxEvent: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'inbox-1',
          dedupeKey: 'inbox-dedupe',
          channel: 'TELEGRAM',
          createdAt: clock.now(),
          normalizedData: {
            senderHmac: 'sender-hmac',
            accountExternalId: 'bot-id',
            externalMessageId: 'telegram-message-id',
            repliedToExternalMessageId: 'reflection-prompt-id',
            occurredAt: clock.now().toISOString(),
            media: {
              kind: 'VOICE',
              providerFileIdEncrypted: protectedFileId.ciphertext.toString('base64'),
              providerFileIdKeyId: protectedFileId.keyId,
              mimeType: 'audio/ogg',
              durationSeconds: 5,
            },
          },
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      studentChannelIdentity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'identity-1',
          studentId: 'student-1',
          student: {
            id: 'student-1',
            preferredLocale: 'tr',
            curriculumStage: 'INTRODUCTION',
            version: 1,
          },
        }),
      },
      message: {
        findUnique: vi.fn().mockResolvedValue({ id: 'message-1' }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'prompt-message-1',
          messageIntent: {
            payload: {
              eventKey: 'PRACTICE_REFLECTION_REQUEST',
              practiceSessionId: 'session-1',
            },
          },
        }),
      },
      voiceMessageMedia: {
        upsert: vi.fn().mockImplementation(async () => media),
        update: voiceUpdate,
      },
      practiceReflection: { findUnique: vi.fn().mockResolvedValue(null) },
      practiceSession: { findFirst: vi.fn().mockResolvedValue({ id: 'session-1' }) },
      consent: {
        findFirst: vi.fn(async ({ where }: { where: { scope: ConsentScope } }) => ({
          status:
            where.scope === ConsentScope.REFLECTION_STORAGE
              ? ConsentStatus.GRANTED
              : ConsentStatus.WITHDRAWN,
        })),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { file_path: 'voice/file.ogg' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(original, { status: 200, headers: { 'content-type': 'audio/ogg' } }),
      );
    const processor = new VoiceMessageProcessor(
      prisma as never,
      createConfig(key),
      clock,
      request as typeof fetch,
      { get: vi.fn(), put },
      {
        probeDuration: vi.fn().mockResolvedValue(5),
        normalizeToFlac: vi.fn(),
      },
    );

    await expect(processor.process('inbox-1')).resolves.toBe('processed');

    expect(reflectionCreate).toHaveBeenCalledWith({
      data: { practiceSessionId: 'session-1', voiceMediaId: 'media-1' },
    });
    expect(tx.conversationContextResolution.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entityId: 'session-1',
          resolutionMethod: 'EXPLICIT_REPLY',
        }),
      }),
    );
    expect(media.status).toBe(VoiceMediaStatus.STORED_WITHOUT_AI);
    const encryptedBody = put.mock.calls[0]?.[2] as Buffer;
    expect(encryptedBody).not.toEqual(original);
    expect(
      encryption.decryptBuffer({ ciphertext: encryptedBody, keyId: 'test' }, 'voice-media:media-1'),
    ).toEqual(original);
  });

  it('reuses the stored practice binding on a worker retry instead of creating a second reflection', async () => {
    const key = Buffer.alloc(32, 8);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const protectedFileId = encryption.encrypt('telegram-file-id', 'inbox-dedupe:media');
    const original = Buffer.from([1, 2, 3]);
    const encryptedAudio = encryption.encryptBuffer(original, 'voice-media:media-1');
    const transaction = vi.fn();
    const request = vi.fn();
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      inboxEvent: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'inbox-1',
          dedupeKey: 'inbox-dedupe',
          channel: 'TELEGRAM',
          createdAt: clock.now(),
          normalizedData: {
            senderHmac: 'sender-hmac',
            accountExternalId: 'bot-id',
            externalMessageId: 'telegram-message-id',
            occurredAt: clock.now().toISOString(),
            media: {
              kind: 'VOICE',
              providerFileIdEncrypted: protectedFileId.ciphertext.toString('base64'),
              providerFileIdKeyId: protectedFileId.keyId,
            },
          },
        }),
        update,
      },
      studentChannelIdentity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'identity-1',
          studentId: 'student-1',
          student: {
            id: 'student-1',
            preferredLocale: 'tr',
            curriculumStage: 'INTRODUCTION',
            version: 1,
          },
        }),
      },
      message: { findUnique: vi.fn().mockResolvedValue({ id: 'message-1' }) },
      voiceMessageMedia: {
        upsert: vi.fn().mockResolvedValue({
          id: 'media-1',
          status: VoiceMediaStatus.FAILED,
          storageKey: 'voice/student-1/media-1.enc',
          storageEncryptionKeyId: 'test',
          durationSeconds: 5,
        }),
        update,
      },
      practiceReflection: {
        findUnique: vi.fn().mockResolvedValue({ practiceSessionId: 'session-1' }),
      },
      consent: {
        findFirst: vi.fn(async ({ where }: { where: { scope: ConsentScope } }) => ({
          status:
            where.scope === ConsentScope.REFLECTION_STORAGE
              ? ConsentStatus.GRANTED
              : ConsentStatus.WITHDRAWN,
        })),
      },
      $transaction: transaction,
    };
    const processor = new VoiceMessageProcessor(
      prisma as never,
      createConfig(key),
      clock,
      request as typeof fetch,
      { get: vi.fn().mockResolvedValue(encryptedAudio.ciphertext), put: vi.fn() },
      {
        probeDuration: vi.fn(),
        normalizeToFlac: vi.fn(),
      },
    );

    await expect(processor.process('inbox-1')).resolves.toBe('processed');

    expect(request).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'media-1' },
        data: { status: VoiceMediaStatus.STORED_WITHOUT_AI, errorCode: null },
      }),
    );
  });
});

function createConfig(key: Buffer) {
  return {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
    ACTIVE_DATA_KEY_ID: 'test',
    TELEGRAM_BOT_TOKEN: 'telegram-token',
    R2_PRIVATE_BUCKET: 'private-test',
  } as ApplicationConfig;
}
