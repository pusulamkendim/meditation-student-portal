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
    expect(events.map((event) => event.dedupeKey)).toEqual([
      'wa:phone-1:message:wamid.1',
      'wa:phone-1:status:wamid.out:delivered:2',
    ]);
  });
});
