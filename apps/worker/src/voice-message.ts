import { createHash } from 'node:crypto';
import {
  FieldEncryption,
  GeminiPaidAdapter,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  ConsentScope,
  ConsentStatus,
  LlmTask,
  PracticeSessionStatus,
  PrismaClient,
  VoiceMediaStatus,
  type ChannelType,
} from '@meditation/database';
import { z } from 'zod';
import { normalizeAudioToFlac, probeAudioDuration } from './audio-tools.js';
import { releaseBudget, reserveBudget, settleBudget } from './llm-budget.js';
import { WorkerObjectStorage } from './knowledge-storage.js';
import { createResponseIntent, findOpenReflectionSessionId } from './practice-response.js';

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPTION_SECONDS = 120;
const DEFAULT_TRANSCRIPTION_PROMPT =
  'Bu Türkçe meditasyon refleksiyonu ses kaydını kelimesi kelimesine yazıya dök. Özetleme, yorumlama, düzeltme veya yeni içerik ekleme. Yalnızca transkripsiyon metnini döndür.';

const normalizedMediaSchema = z.object({
  kind: z.enum(['VOICE', 'AUDIO']),
  providerFileIdEncrypted: z.string().min(1),
  providerFileIdKeyId: z.string().min(1),
  mimeType: z.string().optional(),
  checksum: z.string().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  byteSize: z.number().int().nonnegative().optional(),
  fileName: z.string().optional(),
});

type Fetch = typeof fetch;
type VoiceStorage = Pick<WorkerObjectStorage, 'get' | 'put'>;
type AudioTools = {
  probeDuration: typeof probeAudioDuration;
  normalizeToFlac: typeof normalizeAudioToFlac;
};

export class VoiceMessageProcessor {
  private readonly encryption: FieldEncryption;
  private readonly storage: VoiceStorage;
  private readonly audioTools: AudioTools;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
    private readonly request: Fetch = fetch,
    storage?: VoiceStorage,
    audioTools: AudioTools = {
      probeDuration: probeAudioDuration,
      normalizeToFlac: normalizeAudioToFlac,
    },
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Voice message encryption configuration is required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.storage = storage ?? new WorkerObjectStorage(config);
    this.audioTools = audioTools;
  }

  async process(inboxEventId: string): Promise<'processed' | 'ignored'> {
    const inbox = await this.prisma.inboxEvent.findUniqueOrThrow({ where: { id: inboxEventId } });
    const normalized = inbox.normalizedData as Record<string, unknown>;
    const parsedMedia = normalizedMediaSchema.safeParse(normalized.media);
    if (
      !parsedMedia.success ||
      typeof normalized.senderHmac !== 'string' ||
      typeof normalized.accountExternalId !== 'string'
    )
      return 'ignored';

    const identity = await this.prisma.studentChannelIdentity.findFirst({
      where: {
        externalUserHmac: normalized.senderHmac,
        channelAccount: { type: inbox.channel, externalId: normalized.accountExternalId },
      },
      include: { student: true },
    });
    if (!identity) {
      await this.prisma.inboxEvent.update({
        where: { id: inbox.id },
        data: { processedAt: this.clock.now() },
      });
      return 'ignored';
    }

    const occurredAt = parseOccurredAt(normalized.occurredAt, inbox.createdAt);
    const message = await this.ensureInboundMessage(
      inbox,
      normalized,
      identity.id,
      identity.studentId,
      occurredAt,
    );
    let media = await this.prisma.voiceMessageMedia.upsert({
      where: { inboxEventId: inbox.id },
      create: {
        inboxEventId: inbox.id,
        messageId: message.id,
        studentId: identity.studentId,
        channelIdentityId: identity.id,
        status: VoiceMediaStatus.RECEIVED,
        contentType: parsedMedia.data.mimeType,
        durationSeconds: parsedMedia.data.durationSeconds
          ? Math.ceil(parsedMedia.data.durationSeconds)
          : undefined,
        byteSize: parsedMedia.data.byteSize,
        originalFileName: parsedMedia.data.fileName?.slice(0, 240),
      },
      update: { messageId: message.id },
    });
    if (media.status === VoiceMediaStatus.TRANSCRIBED) return 'processed';

    const storageAllowed = await this.hasConsent(
      identity.studentId,
      ConsentScope.REFLECTION_STORAGE,
    );
    if (!storageAllowed) {
      await this.markMedia(media.id, VoiceMediaStatus.FAILED, 'STORAGE_CONSENT_REQUIRED');
      await this.markProcessed(inbox.id, identity.studentId);
      return 'ignored';
    }

    let original: Buffer;
    if (!media.storageKey || !media.storageEncryptionKeyId) {
      try {
        const providerFileId = this.encryption.decrypt(
          {
            ciphertext: Buffer.from(parsedMedia.data.providerFileIdEncrypted, 'base64'),
            keyId: parsedMedia.data.providerFileIdKeyId,
          },
          `${inbox.dedupeKey}:media`,
        );
        const downloaded = await this.downloadProviderAudio(inbox.channel, providerFileId);
        original = downloaded.body;
        if (original.length > MAX_AUDIO_BYTES) {
          await this.markMedia(media.id, VoiceMediaStatus.FAILED, 'AUDIO_TOO_LARGE');
          await this.markProcessed(inbox.id, identity.studentId);
          return 'ignored';
        }
        verifyChecksum(original, parsedMedia.data.checksum);
        const duration =
          parsedMedia.data.durationSeconds ?? (await this.audioTools.probeDuration(original));
        const storageKey = `voice/${identity.studentId}/${media.id}.enc`;
        const encrypted = this.encryption.encryptBuffer(original, `voice-media:${media.id}`);
        await this.storage.put(
          this.config.R2_PRIVATE_BUCKET,
          storageKey,
          encrypted.ciphertext,
          'application/octet-stream',
        );
        media = await this.prisma.voiceMessageMedia.update({
          where: { id: media.id },
          data: {
            status: VoiceMediaStatus.STORED,
            storageKey,
            storageEncryptionKeyId: encrypted.keyId,
            contentType: downloaded.contentType ?? parsedMedia.data.mimeType ?? 'audio/ogg',
            byteSize: original.length,
            durationSeconds: duration === undefined ? undefined : Math.ceil(duration),
            errorCode: null,
          },
        });
      } catch (error) {
        await this.markMedia(
          media.id,
          VoiceMediaStatus.FAILED,
          error instanceof Error ? error.name : 'AUDIO_DOWNLOAD_FAILED',
        );
        throw error;
      }
    } else {
      const encrypted = await this.storage.get(this.config.R2_PRIVATE_BUCKET, media.storageKey);
      original = this.encryption.decryptBuffer(
        { ciphertext: encrypted, keyId: media.storageEncryptionKeyId },
        `voice-media:${media.id}`,
      );
    }

    const existingReflection = await this.prisma.practiceReflection.findUnique({
      where: { voiceMediaId: media.id },
      select: { practiceSessionId: true },
    });
    const reflectionContext = existingReflection
      ? {
          sessionId: existingReflection.practiceSessionId,
          method: 'STORED_MEDIA',
        }
      : await this.resolveReflectionContext(identity.studentId, normalized, occurredAt);
    if (!reflectionContext) {
      await this.markProcessed(inbox.id, identity.studentId);
      return 'processed';
    }

    if (!existingReflection) {
      await this.prisma.$transaction(async (tx) => {
        await tx.practiceReflection.create({
          data: {
            practiceSessionId: reflectionContext.sessionId,
            voiceMediaId: media.id,
          },
        });
        await tx.conversationContextResolution.upsert({
          where: { inboxEventId: inbox.id },
          create: {
            inboxEventId: inbox.id,
            sourceMessageId: reflectionContext.sourceMessageId,
            eventKey: 'PRACTICE_REFLECTION_REQUEST',
            entityType: 'PracticeSession',
            entityId: reflectionContext.sessionId,
            resolutionMethod: reflectionContext.method,
            resolvedAt: this.clock.now(),
          },
          update: {},
        });
        const intentId = await createResponseIntent(tx, this.clock.now(), {
          eventKey: 'PRACTICE_REFLECTION_RECEIVED',
          studentId: identity.studentId,
          channelIdentityId: identity.id,
          locale: identity.student.preferredLocale,
          stage: identity.student.curriculumStage,
          aggregateVersion: identity.student.version,
          idempotencyKey: `practice:${reflectionContext.sessionId}:reflection-received`,
          variables: {},
          context: { practiceSessionId: reflectionContext.sessionId },
        });
        await tx.inboundResponseOwnership.upsert({
          where: { inboundMessageId: inbox.id },
          create: {
            inboundMessageId: inbox.id,
            owner: intentId ? 'SYSTEM_STANDARD_MESSAGE' : 'NO_REPLY',
            referenceId: intentId,
          },
          update: {},
        });
        await tx.inboxEvent.update({
          where: { id: inbox.id },
          data: { processedAt: this.clock.now(), studentId: identity.studentId },
        });
      });
    } else {
      await this.markProcessed(inbox.id, identity.studentId);
    }

    const aiAllowed =
      (await this.hasConsent(identity.studentId, ConsentScope.REFLECTION_AI)) ||
      (await this.hasConsent(identity.studentId, ConsentScope.AGENT_REPLY_AI));
    if (!aiAllowed) {
      await this.markMedia(media.id, VoiceMediaStatus.STORED_WITHOUT_AI, null);
      return 'processed';
    }
    if ((media.durationSeconds ?? 0) > MAX_TRANSCRIPTION_SECONDS) {
      await this.markMedia(media.id, VoiceMediaStatus.TOO_LONG, 'TRANSCRIPTION_DURATION_LIMIT');
      return 'processed';
    }

    await this.transcribe(
      media.id,
      message.id,
      identity.studentId,
      reflectionContext.sessionId,
      original,
    );
    return 'processed';
  }

  private async transcribe(
    mediaId: string,
    messageId: string,
    studentId: string,
    practiceSessionId: string,
    original: Buffer,
  ): Promise<void> {
    const task = await this.prisma.llmTaskConfig.findUnique({
      where: { task: LlmTask.REFLECTION_TRANSCRIPTION },
      include: {
        primaryModel: {
          include: { provider: true, priceVersions: { orderBy: { effectiveAt: 'desc' }, take: 1 } },
        },
        promptVersion: true,
      },
    });
    const model = task?.primaryModel;
    if (
      !task?.enabled ||
      !model ||
      model.status !== 'ACTIVE' ||
      model.provider.status !== 'ENABLED' ||
      model.provider.adapterId !== 'gemini' ||
      !this.config.GEMINI_API_KEY
    ) {
      await this.markMedia(mediaId, VoiceMediaStatus.STORED, 'TRANSCRIPTION_MODEL_UNAVAILABLE');
      return;
    }
    const operationId = `reflection-transcription:${mediaId}:v${task.version}`;
    const prior = await this.prisma.llmUsageLog.findFirst({
      where: { operationId },
      orderBy: { attempt: 'desc' },
      select: { attempt: true },
    });
    const attempt = (prior?.attempt ?? 0) + 1;
    const price = model.priceVersions[0];
    const estimatedTokens = Math.max(1, Math.ceil(original.length / 128));
    const estimate = price
      ? (BigInt(estimatedTokens) * price.inputMicroUsdPerM +
          BigInt(2048) * price.outputMicroUsdPerM) /
        1_000_000n
      : 0n;
    await reserveBudget(this.prisma, operationId, estimate, this.clock.now());
    const started = this.clock.now().getTime();
    await this.prisma.voiceMessageMedia.update({
      where: { id: mediaId },
      data: { status: VoiceMediaStatus.TRANSCRIBING, errorCode: null },
    });
    try {
      const normalized = await this.audioTools.normalizeToFlac(original);
      const result = await new GeminiPaidAdapter(this.config.GEMINI_API_KEY).transcribeAudio({
        model: {
          id: model.id,
          providerId: model.providerId,
          providerModelId: model.providerModelId,
          status: 'ACTIVE',
        },
        operationId,
        prompt: task.promptVersion?.content ?? DEFAULT_TRANSCRIPTION_PROMPT,
        audio: normalized,
        mimeType: 'audio/flac',
        maxOutputTokens: Math.min(model.outputTokenLimit, 2048),
      });
      const encrypted = this.encryption.encrypt(
        result.text,
        `practice:${practiceSessionId}:reflection`,
      );
      const actual = price
        ? (BigInt(result.inputTokens) * price.inputMicroUsdPerM +
            BigInt(result.outputTokens) * price.outputMicroUsdPerM) /
          1_000_000n
        : 0n;
      await this.prisma.$transaction([
        this.prisma.practiceReflection.update({
          where: { practiceSessionId },
          data: {
            contentEncrypted: new Uint8Array(encrypted.ciphertext),
            contentKeyId: encrypted.keyId,
          },
        }),
        this.prisma.voiceMessageMedia.update({
          where: { id: mediaId },
          data: {
            status: VoiceMediaStatus.TRANSCRIBED,
            transcriptionModel: model.providerModelId,
            transcribedAt: this.clock.now(),
            errorCode: null,
          },
        }),
        this.prisma.llmUsageLog.create({
          data: {
            operationId,
            attempt,
            task: LlmTask.REFLECTION_TRANSCRIPTION,
            studentId,
            sourceMessageId: messageId,
            requestedModelId: model.id,
            actualModelId: model.id,
            priceVersionId: price?.id,
            promptVersionId: task.promptVersionId,
            providerRequestId: result.providerRequestId,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            totalTokens: result.totalTokens,
            estimatedMicroUsd: actual,
            latencyMs: this.clock.now().getTime() - started,
            status: 'SUCCEEDED',
            metadata: { mediaId, practiceSessionId, normalizedMimeType: 'audio/flac' },
          },
        }),
      ]);
      await settleBudget(this.prisma, operationId, actual, this.clock.now());
    } catch (error) {
      await releaseBudget(this.prisma, operationId);
      await this.prisma.voiceMessageMedia.update({
        where: { id: mediaId },
        data: {
          status: VoiceMediaStatus.FAILED,
          errorCode: error instanceof Error ? error.name : 'TRANSCRIPTION_FAILED',
        },
      });
      await this.prisma.llmUsageLog
        .create({
          data: {
            operationId,
            attempt,
            task: LlmTask.REFLECTION_TRANSCRIPTION,
            studentId,
            sourceMessageId: messageId,
            requestedModelId: model.id,
            actualModelId: model.id,
            promptVersionId: task.promptVersionId,
            latencyMs: this.clock.now().getTime() - started,
            status: 'FAILED',
            errorCode: error instanceof Error ? error.name : 'TRANSCRIPTION_FAILED',
            metadata: { mediaId, practiceSessionId },
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async resolveReflectionContext(
    studentId: string,
    normalized: Record<string, unknown>,
    occurredAt: Date,
  ): Promise<{ sessionId: string; sourceMessageId?: string; method: string } | undefined> {
    if (typeof normalized.repliedToExternalMessageId === 'string') {
      const source = await this.prisma.message.findFirst({
        where: {
          studentId,
          direction: 'OUTBOUND',
          externalMessageId: normalized.repliedToExternalMessageId,
        },
        include: { messageIntent: true },
      });
      const payload = source?.messageIntent?.payload as Record<string, unknown> | undefined;
      if (
        payload?.eventKey === 'PRACTICE_REFLECTION_REQUEST' &&
        typeof payload.practiceSessionId === 'string'
      ) {
        const session = await this.prisma.practiceSession.findFirst({
          where: {
            id: payload.practiceSessionId,
            studentId,
            status: PracticeSessionStatus.COMPLETED,
            reflection: { is: null },
          },
          select: { id: true },
        });
        if (session)
          return { sessionId: session.id, sourceMessageId: source?.id, method: 'EXPLICIT_REPLY' };
      }
    }
    const sessionId = await this.prisma.$transaction((tx) =>
      findOpenReflectionSessionId(tx, studentId, occurredAt),
    );
    if (!sessionId) return undefined;
    return { sessionId, method: 'RECENT_EVENT' };
  }

  private async ensureInboundMessage(
    inbox: { id: string; dedupeKey: string; createdAt: Date },
    normalized: Record<string, unknown>,
    channelIdentityId: string,
    studentId: string,
    occurredAt: Date,
  ) {
    const existing = await this.prisma.message.findUnique({ where: { inboxEventId: inbox.id } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          studentId,
          channelIdentityId,
          direction: 'INBOUND',
          status: 'RECEIVED',
          externalMessageId:
            typeof normalized.externalMessageId === 'string' ? normalized.externalMessageId : null,
          occurredAt,
          inboxEventId: inbox.id,
        },
      });
      await tx.inboxEvent.update({ where: { id: inbox.id }, data: { studentId } });
      return message;
    });
  }

  private async downloadProviderAudio(
    channel: ChannelType,
    providerFileId: string,
  ): Promise<{ body: Buffer; contentType?: string }> {
    return channel === 'WHATSAPP'
      ? this.downloadWhatsApp(providerFileId)
      : this.downloadTelegram(providerFileId);
  }

  private async downloadWhatsApp(providerFileId: string) {
    if (!this.config.WHATSAPP_ACCESS_TOKEN) throw new Error('WHATSAPP_MEDIA_TOKEN_UNAVAILABLE');
    const headers = { authorization: `Bearer ${this.config.WHATSAPP_ACCESS_TOKEN}` };
    const metadataResponse = await this.request(
      `https://graph.facebook.com/v23.0/${encodeURIComponent(providerFileId)}`,
      { headers },
    );
    if (!metadataResponse.ok)
      throw new Error(`WHATSAPP_MEDIA_METADATA_HTTP_${metadataResponse.status}`);
    const metadata = z
      .object({
        url: z.string().url(),
        mime_type: z.string().optional(),
        file_size: z.number().optional(),
      })
      .parse(await metadataResponse.json());
    if ((metadata.file_size ?? 0) > MAX_AUDIO_BYTES) throw new Error('AUDIO_TOO_LARGE');
    const response = await this.request(metadata.url, { headers });
    if (!response.ok) throw new Error(`WHATSAPP_MEDIA_DOWNLOAD_HTTP_${response.status}`);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: metadata.mime_type ?? response.headers.get('content-type') ?? undefined,
    };
  }

  private async downloadTelegram(providerFileId: string) {
    if (!this.config.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_MEDIA_TOKEN_UNAVAILABLE');
    const metadataResponse = await this.request(
      `https://api.telegram.org/bot${this.config.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(providerFileId)}`,
    );
    if (!metadataResponse.ok)
      throw new Error(`TELEGRAM_MEDIA_METADATA_HTTP_${metadataResponse.status}`);
    const metadata = z
      .object({ ok: z.literal(true), result: z.object({ file_path: z.string().min(1) }) })
      .parse(await metadataResponse.json());
    const response = await this.request(
      `https://api.telegram.org/file/bot${this.config.TELEGRAM_BOT_TOKEN}/${metadata.result.file_path}`,
    );
    if (!response.ok) throw new Error(`TELEGRAM_MEDIA_DOWNLOAD_HTTP_${response.status}`);
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? undefined,
    };
  }

  private async hasConsent(studentId: string, scope: ConsentScope): Promise<boolean> {
    const consent = await this.prisma.consent.findFirst({
      where: { studentId, scope },
      orderBy: { occurredAt: 'desc' },
    });
    return consent?.status === ConsentStatus.GRANTED;
  }

  private markMedia(id: string, status: VoiceMediaStatus, errorCode: string | null) {
    return this.prisma.voiceMessageMedia.update({ where: { id }, data: { status, errorCode } });
  }

  private markProcessed(inboxEventId: string, studentId: string) {
    return this.prisma.inboxEvent.update({
      where: { id: inboxEventId },
      data: { processedAt: this.clock.now(), studentId },
    });
  }
}

function parseOccurredAt(value: unknown, fallback: Date): Date {
  if (typeof value !== 'string') return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function verifyChecksum(body: Buffer, expected: string | undefined): void {
  if (!expected) return;
  const actualBase64 = createHash('sha256').update(body).digest('base64');
  const actualHex = createHash('sha256').update(body).digest('hex');
  if (expected !== actualBase64 && expected.toLowerCase() !== actualHex)
    throw new Error('AUDIO_CHECKSUM_MISMATCH');
}
