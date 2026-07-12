import { describe, expect, it, vi } from 'vitest';
import { WhatsAppCloudAdapter } from './provider-adapters.js';

describe('WhatsAppCloudAdapter', () => {
  it('sends approved templates with body parameters and quick-reply payloads', async () => {
    const request = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    });
    const adapter = new WhatsAppCloudAdapter('token', 'phone', 'v23.0', request);
    await adapter.send({
      intentId: 'intent',
      recipient: '90500',
      content: 'rendered',
      locale: 'tr-TR',
      idempotencyKey: 'key',
      template: { name: 'practice_checkin', languageCode: 'tr', parameters: ['15 dakika'] },
      quickReplies: [{ id: 'practice:id:nonce:COMPLETED', title: 'Yaptım' }],
    });
    const init = request.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as {
      type: string;
      template: { components: Array<{ type: string }> };
    };
    expect(body.type).toBe('template');
    expect(body.template.components.map((component) => component.type)).toEqual(['body', 'button']);
  });
});
