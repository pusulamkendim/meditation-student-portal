import { describe, expect, it, vi } from 'vitest';

import { MessageCatalogController } from './message-catalog.controller.js';
import type { MessageCatalogService } from './message-catalog.service.js';

function controllerWith(overrides: Partial<MessageCatalogService>) {
  return new MessageCatalogController(overrides as MessageCatalogService);
}

describe('MessageCatalogController', () => {
  it('returns a bad request when a new version omits a required placeholder', async () => {
    const controller = controllerWith({
      createVersion: vi
        .fn()
        .mockRejectedValue(new Error('Required placeholder is missing: durationText')),
    });

    await expect(
      controller.createVersion('10000000-0000-4000-8000-000000000001', {
        content: 'Planlanan süre 20 dakika.',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Required placeholder is missing: durationText',
    });
  });

  it('returns a bad request when quick creation omits a required placeholder', async () => {
    const controller = controllerWith({
      quickCreate: vi
        .fn()
        .mockRejectedValue(new Error('Required placeholder is missing: durationText')),
    });

    await expect(
      controller.quickCreate({
        eventKey: 'PRACTICE_CHECKIN',
        name: 'Pratik geri bildirimi',
        channel: 'WHATSAPP',
        locale: 'tr-TR',
        content: 'Planlanan süre 20 dakika.',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Required placeholder is missing: durationText',
    });
  });
});
