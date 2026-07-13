import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPayload } from './whatsapp-normalizer.js';

describe('WhatsApp normalizer', () => {
  it('normalizes every message and status in a batch', () => {
    const events = normalizeWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [
                  {
                    id: 'wamid.1',
                    from: '90500',
                    type: 'text',
                    timestamp: '1',
                    context: { id: 'wamid.previous' },
                    text: { body: 'KAYIT' },
                  },
                ],
                statuses: [{ id: 'wamid.out', status: 'delivered', timestamp: '2' }],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.repliedToExternalMessageId).toBe('wamid.previous');
    expect(events.map((event) => event.dedupeKey)).toEqual([
      'wa:phone-1:message:wamid.1',
      'wa:phone-1:status:wamid.out:delivered:2',
    ]);
  });
  it('uses quick-reply payload as the normalized message text', () => {
    const [event] = normalizeWhatsAppPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-1' },
                messages: [
                  {
                    id: 'wamid.button',
                    from: '90500',
                    type: 'interactive',
                    timestamp: '1',
                    interactive: { button_reply: { id: 'practice:session:nonce:COMPLETED' } },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(event?.text).toBe('practice:session:nonce:COMPLETED');
  });
});
