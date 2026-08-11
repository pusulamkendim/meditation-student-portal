import { z } from 'zod';
import type { NormalizedInboundAudio } from './whatsapp-normalizer.js';

const updateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: z
      .object({
        message_id: z.number().int(),
        date: z.number().int(),
        text: z.string().optional(),
        caption: z.string().optional(),
        voice: z
          .object({
            file_id: z.string().min(1),
            file_unique_id: z.string().min(1),
            duration: z.number().int().nonnegative(),
            mime_type: z.string().optional(),
            file_size: z.number().int().nonnegative().optional(),
          })
          .optional(),
        audio: z
          .object({
            file_id: z.string().min(1),
            file_unique_id: z.string().min(1),
            duration: z.number().int().nonnegative(),
            mime_type: z.string().optional(),
            file_size: z.number().int().nonnegative().optional(),
            file_name: z.string().optional(),
          })
          .optional(),
        chat: z.object({ id: z.number().int(), type: z.string() }),
        from: z.object({ id: z.number().int() }).optional(),
        reply_to_message: z.object({ message_id: z.number().int() }).passthrough().optional(),
      })
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        from: z.object({ id: z.number().int() }),
        message: z
          .object({
            message_id: z.number().int(),
            date: z.number().int(),
            chat: z.object({ id: z.number().int(), type: z.string() }),
          })
          .optional(),
      })
      .optional(),
  })
  .passthrough();

export interface NormalizedTelegramUpdate {
  dedupeKey: string;
  updateId: number;
  externalMessageId: string;
  sender: string;
  text?: string;
  occurredAt: Date;
  ignored: boolean;
  repliedToExternalMessageId?: string;
  audio?: NormalizedInboundAudio;
}

export function normalizeTelegramUpdate(
  payload: unknown,
  accountId: string,
): NormalizedTelegramUpdate {
  const update = updateSchema.parse(payload);
  const source = update.message ?? update.callback_query?.message;
  const sender = update.message?.from?.id ?? update.callback_query?.from.id;
  const ignored = !source || source.chat.type !== 'private' || sender === undefined;
  return {
    dedupeKey: `tg:${accountId}:update:${update.update_id}`,
    updateId: update.update_id,
    externalMessageId: update.message
      ? String(update.message.message_id)
      : (update.callback_query?.id ?? String(update.update_id)),
    sender: sender === undefined ? 'ignored' : String(sender),
    text: update.message?.text ?? update.message?.caption ?? update.callback_query?.data,
    audio: update.message?.voice
      ? {
          kind: 'VOICE',
          providerFileId: update.message.voice.file_id,
          mimeType: update.message.voice.mime_type ?? 'audio/ogg',
          durationSeconds: update.message.voice.duration,
          byteSize: update.message.voice.file_size,
        }
      : update.message?.audio
        ? {
            kind: 'AUDIO',
            providerFileId: update.message.audio.file_id,
            mimeType: update.message.audio.mime_type,
            durationSeconds: update.message.audio.duration,
            byteSize: update.message.audio.file_size,
            fileName: update.message.audio.file_name,
          }
        : undefined,
    repliedToExternalMessageId: update.message?.reply_to_message
      ? String(update.message.reply_to_message.message_id)
      : undefined,
    occurredAt: new Date((source?.date ?? 0) * 1000),
    ignored,
  };
}
