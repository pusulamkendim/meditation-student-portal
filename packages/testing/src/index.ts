export interface SentMessage {
  recipient: string;
  text: string;
  idempotencyKey: string;
}

export class FakeChannelAdapter {
  readonly sentMessages: SentMessage[] = [];

  async send(message: SentMessage): Promise<{ providerMessageId: string }> {
    this.sentMessages.push(message);
    return { providerMessageId: `fake-${this.sentMessages.length}` };
  }
}
