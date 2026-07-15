import type {
  ChannelAdapter,
  ChannelSendResult,
  OutboundChannelMessage,
} from './channel-adapter.js';
type Fetch = typeof fetch;
export class WhatsAppCloudAdapter implements ChannelAdapter {
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion = 'v23.0',
    private readonly request: Fetch = fetch,
  ) {}
  async send(message: OutboundChannelMessage): Promise<ChannelSendResult> {
    if ((message.quickReplies?.length ?? 0) > 3) {
      throw new Error('WhatsApp supports at most 3 quick-reply buttons.');
    }
    const response = await this.request(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify(
          message.template
            ? {
                messaging_product: 'whatsapp',
                to: message.recipient,
                type: 'template',
                template: {
                  name: message.template.name,
                  language: { code: message.template.languageCode },
                  components: [
                    ...(message.template.parameters.length
                      ? [
                          {
                            type: 'body',
                            parameters: message.template.parameters.map((text) => ({
                              type: 'text',
                              text,
                            })),
                          },
                        ]
                      : []),
                    ...(message.quickReplies ?? []).map((reply, index) => ({
                      type: 'button',
                      sub_type: 'quick_reply',
                      index: String(index),
                      parameters: [{ type: 'payload', payload: reply.id }],
                    })),
                  ],
                },
              }
            : {
                messaging_product: 'whatsapp',
                to: message.recipient,
                ...(message.quickReplies?.length
                  ? {
                      type: 'interactive',
                      interactive: {
                        type: 'button',
                        body: { text: message.content },
                        action: {
                          buttons: message.quickReplies.map((reply) => ({
                            type: 'reply',
                            reply: { id: reply.id, title: reply.title },
                          })),
                        },
                      },
                    }
                  : { type: 'text', text: { body: message.content } }),
              },
        ),
      },
    );
    if (!response.ok) throw new Error(`WhatsApp send failed: ${response.status}`);
    const value = (await response.json()) as { messages?: Array<{ id: string }> };
    const id = value.messages?.[0]?.id;
    if (!id) throw new Error('WhatsApp response has no message id.');
    return { providerMessageId: id };
  }
}
export class TelegramBotAdapter implements ChannelAdapter {
  constructor(
    private readonly token: string,
    private readonly request: Fetch = fetch,
  ) {}
  async send(message: OutboundChannelMessage): Promise<ChannelSendResult> {
    const response = await this.request(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: message.recipient,
        text: message.content,
        reply_markup: message.quickReplies?.length
          ? {
              inline_keyboard: [
                message.quickReplies.map((reply) => ({
                  text: reply.title,
                  callback_data: reply.id,
                })),
              ],
            }
          : undefined,
      }),
    });
    if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
    const value = (await response.json()) as { result?: { message_id: number } };
    if (!value.result) throw new Error('Telegram response has no message id.');
    return { providerMessageId: String(value.result.message_id) };
  }
}
