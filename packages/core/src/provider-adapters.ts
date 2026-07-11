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
    const response = await this.request(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.recipient,
          type: 'text',
          text: { body: message.content },
        }),
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
      body: JSON.stringify({ chat_id: message.recipient, text: message.content }),
    });
    if (!response.ok) throw new Error(`Telegram send failed: ${response.status}`);
    const value = (await response.json()) as { result?: { message_id: number } };
    if (!value.result) throw new Error('Telegram response has no message id.');
    return { providerMessageId: String(value.result.message_id) };
  }
}
