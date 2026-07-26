import { describe, expect, it, vi } from 'vitest';

import { requeueSuppressedWhatsAppIntents } from './whatsapp-intent-retry.js';

describe('requeueSuppressedWhatsAppIntents', () => {
  it('requeues an eligible suppressed intent after the inbound message can be processed', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: '10000000-0000-4000-8000-000000000001' }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue({});
    const inboundAt = new Date('2026-07-26T08:28:46.000Z');

    await expect(
      requeueSuppressedWhatsAppIntents(
        {
          messageIntent: { findMany, updateMany },
          outboxEvent: { create },
        } as never,
        ['10000000-0000-4000-8000-000000000002'],
        inboundAt,
      ),
    ).resolves.toBe(1);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'SUPPRESSED',
          suppressionReason: 'WHATSAPP_TEMPLATE_REQUIRED',
          dueAt: { lte: inboundAt },
          expiresAt: { gt: inboundAt },
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        topic: 'message.intents',
        aggregateId: '10000000-0000-4000-8000-000000000001',
        payload: { intentId: '10000000-0000-4000-8000-000000000001' },
        availableAt: new Date('2026-07-26T08:29:16.000Z'),
      }),
    });
  });

  it('does not query or mutate intents without a matched channel identity', async () => {
    const findMany = vi.fn();

    await expect(
      requeueSuppressedWhatsAppIntents(
        {
          messageIntent: { findMany },
        } as never,
        [],
        new Date('2026-07-26T08:28:46.000Z'),
      ),
    ).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
