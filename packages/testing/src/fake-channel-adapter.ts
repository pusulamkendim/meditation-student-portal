import type { ChannelAdapter, ChannelSendResult, OutboundChannelMessage } from '@meditation/core';

export class FakeChannelAdapter implements ChannelAdapter {
  readonly sent: OutboundChannelMessage[] = [];
  private readonly results = new Map<string, ChannelSendResult>();
  private failure?: Error;

  failWith(error: Error): void {
    this.failure = error;
  }

  async send(message: OutboundChannelMessage): Promise<ChannelSendResult> {
    if (this.failure) throw this.failure;
    const existing = this.results.get(message.idempotencyKey);
    if (existing) return existing;
    const result = { providerMessageId: `fake-${this.results.size + 1}` };
    this.sent.push(structuredClone(message));
    this.results.set(message.idempotencyKey, result);
    return result;
  }
}
