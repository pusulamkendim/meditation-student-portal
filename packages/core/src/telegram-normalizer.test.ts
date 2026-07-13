import { describe, expect, it } from 'vitest';
import { normalizeTelegramUpdate } from './telegram-normalizer.js';

describe('Telegram normalizer', () => {
  it('accepts private updates and ignores groups', () => {
    const base = {
      update_id: 7,
      message: { message_id: 2, date: 10, text: 'KAYIT', from: { id: 5 } },
    };
    expect(
      normalizeTelegramUpdate(
        { ...base, message: { ...base.message, chat: { id: 5, type: 'private' } } },
        'bot',
      ).ignored,
    ).toBe(false);
    expect(
      normalizeTelegramUpdate(
        { ...base, message: { ...base.message, chat: { id: -1, type: 'group' } } },
        'bot',
      ).ignored,
    ).toBe(true);
    expect(
      normalizeTelegramUpdate(
        {
          ...base,
          message: {
            ...base.message,
            chat: { id: 5, type: 'private' },
            reply_to_message: { message_id: 99 },
          },
        },
        'bot',
      ).repliedToExternalMessageId,
    ).toBe('99');
  });
});
