import { z } from 'zod';

const updateSchema = z
  .object({
    update_id: z.number().int().nonnegative(),
    message: z
      .object({
        message_id: z.number().int(),
        date: z.number().int(),
        text: z.string().optional(),
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
    text: update.message?.text ?? update.callback_query?.data,
    repliedToExternalMessageId: update.message?.reply_to_message
      ? String(update.message.reply_to_message.message_id)
      : undefined,
    occurredAt: new Date((source?.date ?? 0) * 1000),
    ignored,
  };
}
