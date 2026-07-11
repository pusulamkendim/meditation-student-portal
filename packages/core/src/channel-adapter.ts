export interface OutboundChannelMessage {
  intentId: string;
  recipient: string;
  content: string;
  locale: string;
  idempotencyKey: string;
}

export interface ChannelSendResult {
  providerMessageId: string;
}

export interface ChannelAdapter {
  send(message: OutboundChannelMessage): Promise<ChannelSendResult>;
}
