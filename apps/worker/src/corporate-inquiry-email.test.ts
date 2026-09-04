import { randomBytes } from 'node:crypto';

import { FakeClock, FieldEncryption } from '@meditation/core';
import { describe, expect, it, vi } from 'vitest';

import {
  CorporateInquiryEmailProcessor,
  purgeExpiredCorporateInquiryData,
} from './corporate-inquiry-email.js';

describe('CorporateInquiryEmailProcessor', () => {
  it('sends the admin and acknowledgement messages once with applicant Reply-To', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const key = randomBytes(32);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const field = (name: string, value: string) =>
      encryption.encrypt(value, `corporate-inquiry:${id}:${name}`);
    const values = {
      first: field('first-name', 'Ayşe'),
      last: field('last-name', 'Yılmaz'),
      email: field('email', 'ayse@example.com'),
      company: field('company', 'Örnek AŞ'),
      note: field('note', 'Sekiz çalışan için bilgi istiyoruz.'),
    };
    let deliveryIndex = 0;
    const prisma = {
      corporateInquiry: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id,
          personalDataDeletedAt: null,
          firstNameEncrypted: values.first.ciphertext,
          firstNameKeyId: 'test',
          lastNameEncrypted: values.last.ciphertext,
          lastNameKeyId: 'test',
          emailEncrypted: values.email.ciphertext,
          emailKeyId: 'test',
          companyEncrypted: values.company.ciphertext,
          companyKeyId: 'test',
          noteEncrypted: values.note.ciphertext,
          noteKeyId: 'test',
        }),
      },
      notificationDelivery: {
        upsert: vi.fn(async ({ create }) => ({ id: `delivery-${++deliveryIndex}`, ...create })),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const send = vi.fn().mockResolvedValue({ MessageId: 'ses-id' });
    const processor = new CorporateInquiryEmailProcessor(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
        ADMIN_EMAIL_FROM: 'Sakin Zihin <hello@example.com>',
        ADMIN_ALERT_EMAIL: 'admin@example.com',
        AWS_SES_REGION: 'eu-central-1',
      },
      new FakeClock('2026-09-04T12:00:00.000Z'),
      { send: send as never, destroy: vi.fn() },
    );
    await processor.process(id);
    expect(send).toHaveBeenCalledTimes(2);
    const adminInput = send.mock.calls[0]?.[0].input;
    expect(adminInput.ReplyToAddresses).toEqual(['ayse@example.com']);
    expect(adminInput.Content.Simple.Subject.Data).toContain('Örnek AŞ');
  });

  it('purges expired personal fields', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await expect(
      purgeExpiredCorporateInquiryData(
        { corporateInquiry: { updateMany } } as never,
        new FakeClock('2026-09-04T12:00:00.000Z'),
      ),
    ).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailEncrypted: null,
          personalDataDeletedAt: new Date('2026-09-04T12:00:00.000Z'),
        }),
      }),
    );
  });
});
