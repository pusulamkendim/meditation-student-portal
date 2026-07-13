import { z } from 'zod';

export interface NormalizedWhatsAppEvent {
  dedupeKey: string;
  accountExternalId: string;
  externalMessageId: string;
  eventType: 'MESSAGE_RECEIVED' | 'MESSAGE_STATUS';
  sender?: string;
  text?: string;
  messageType?: string;
  status?: string;
  repliedToExternalMessageId?: string;
  occurredAt: Date;
}

const payloadSchema = z
  .object({
    entry: z.array(
      z
        .object({
          changes: z.array(
            z
              .object({
                value: z
                  .object({
                    metadata: z.object({ phone_number_id: z.string().min(1) }),
                    messages: z
                      .array(
                        z.object({
                          id: z.string().min(1),
                          from: z.string().min(1),
                          type: z.string().min(1),
                          timestamp: z.string().regex(/^\d+$/),
                          context: z.object({ id: z.string().min(1) }).optional(),
                          text: z.object({ body: z.string() }).optional(),
                          button: z
                            .object({ payload: z.string(), text: z.string().optional() })
                            .optional(),
                          interactive: z
                            .object({
                              button_reply: z
                                .object({ id: z.string(), title: z.string().optional() })
                                .optional(),
                            })
                            .optional(),
                        }),
                      )
                      .optional(),
                    statuses: z
                      .array(
                        z.object({
                          id: z.string().min(1),
                          status: z.string().min(1),
                          timestamp: z.string().regex(/^\d+$/),
                        }),
                      )
                      .optional(),
                  })
                  .passthrough(),
              })
              .passthrough(),
          ),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export function normalizeWhatsAppPayload(payload: unknown): NormalizedWhatsAppEvent[] {
  const parsed = payloadSchema.parse(payload);
  const events: NormalizedWhatsAppEvent[] = [];
  for (const entry of parsed.entry) {
    for (const change of entry.changes) {
      const account = change.value.metadata.phone_number_id;
      for (const message of change.value.messages ?? []) {
        events.push({
          dedupeKey: `wa:${account}:message:${message.id}`,
          accountExternalId: account,
          externalMessageId: message.id,
          eventType: 'MESSAGE_RECEIVED',
          sender: message.from,
          text:
            message.text?.body ?? message.button?.payload ?? message.interactive?.button_reply?.id,
          messageType: message.type,
          repliedToExternalMessageId: message.context?.id,
          occurredAt: new Date(Number(message.timestamp) * 1000),
        });
      }
      for (const status of change.value.statuses ?? []) {
        events.push({
          dedupeKey: `wa:${account}:status:${status.id}:${status.status}:${status.timestamp}`,
          accountExternalId: account,
          externalMessageId: status.id,
          eventType: 'MESSAGE_STATUS',
          status: status.status,
          occurredAt: new Date(Number(status.timestamp) * 1000),
        });
      }
    }
  }
  return events;
}
