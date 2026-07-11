import { describe, expect, it } from 'vitest';

import { FakeChannelAdapter } from './fake-channel-adapter.js';

describe('FakeChannelAdapter', () => {
  it('deduplicates sends by idempotency key', async () => {
    const adapter = new FakeChannelAdapter();
    const message = {
      intentId: 'intent-1',
      recipient: 'recipient',
      content: 'Merhaba',
      locale: 'tr-TR',
      idempotencyKey: 'same-event',
    };
    const first = await adapter.send(message);
    const second = await adapter.send(message);
    expect(second).toEqual(first);
    expect(adapter.sent).toHaveLength(1);
  });
});
