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

  it('preserves Telegram voice metadata and caption context', () => {
    const event = normalizeTelegramUpdate(
      {
        update_id: 8,
        message: {
          message_id: 3,
          date: 20,
          caption: 'Pratik sonrası paylaşımım',
          chat: { id: 5, type: 'private' },
          from: { id: 5 },
          reply_to_message: { message_id: 100 },
          voice: {
            file_id: 'voice-file-id',
            file_unique_id: 'voice-unique-id',
            duration: 42,
            mime_type: 'audio/ogg',
            file_size: 1234,
          },
        },
      },
      'bot',
    );

    expect(event.text).toBe('Pratik sonrası paylaşımım');
    expect(event.repliedToExternalMessageId).toBe('100');
    expect(event.audio).toEqual({
      kind: 'VOICE',
      providerFileId: 'voice-file-id',
      mimeType: 'audio/ogg',
      durationSeconds: 42,
      byteSize: 1234,
    });
  });
});
