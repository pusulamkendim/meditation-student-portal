export interface OutboundChannelMessage {
  intentId: string;
  recipient: string;
  content: string;
  locale: string;
  idempotencyKey: string;
  template?: {
    name: string;
    languageCode: string;
    parameters: string[];
  };
  quickReplies?: Array<{ id: string; title: string }>;
}

export interface ChannelSendResult {
  providerMessageId: string;
}

export interface ChannelAdapter {
  send(message: OutboundChannelMessage): Promise<ChannelSendResult>;
}
