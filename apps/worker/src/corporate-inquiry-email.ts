import { createHash } from 'node:crypto';

import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { FieldEncryption, type ApplicationConfig, type Clock } from '@meditation/core';
import { NotificationChannel, PrismaClient } from '@meditation/database';

type CorporateEmailConfig = Pick<
  ApplicationConfig,
  | 'ACTIVE_DATA_KEY_ID'
  | 'ADMIN_ALERT_EMAIL'
  | 'ADMIN_EMAIL_FROM'
  | 'AWS_SES_REGION'
  | 'DATA_ENCRYPTION_KEYS_JSON'
>;

export class CorporateInquiryEmailProcessor {
  private readonly client: Pick<SESv2Client, 'send' | 'destroy'>;
  private readonly encryption: FieldEncryption;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: CorporateEmailConfig,
    private readonly clock: Clock,
    client?: Pick<SESv2Client, 'send' | 'destroy'>,
  ) {
    if (
      !config.DATA_ENCRYPTION_KEYS_JSON ||
      !config.ACTIVE_DATA_KEY_ID ||
      !config.ADMIN_EMAIL_FROM ||
      !config.ADMIN_ALERT_EMAIL
    )
      throw new Error('Corporate inquiry email configuration is incomplete.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.client = client ?? new SESv2Client({ region: config.AWS_SES_REGION });
  }

  async process(inquiryId: string): Promise<void> {
    const inquiry = await this.prisma.corporateInquiry.findUniqueOrThrow({
      where: { id: inquiryId },
    });
    if (inquiry.personalDataDeletedAt) return;
    const firstName = this.decrypt(
      inquiryId,
      'first-name',
      inquiry.firstNameEncrypted,
      inquiry.firstNameKeyId,
    );
    const lastName = this.decrypt(
      inquiryId,
      'last-name',
      inquiry.lastNameEncrypted,
      inquiry.lastNameKeyId,
    );
    const email = this.decrypt(inquiryId, 'email', inquiry.emailEncrypted, inquiry.emailKeyId);
    const company = this.decrypt(
      inquiryId,
      'company',
      inquiry.companyEncrypted,
      inquiry.companyKeyId,
    );
    const note = this.decrypt(inquiryId, 'note', inquiry.noteEncrypted, inquiry.noteKeyId);

    await this.sendOnce(`corporate-inquiry-admin:${inquiryId}`, 'CORPORATE_INQUIRY_ADMIN_EMAIL', {
      to: this.config.ADMIN_ALERT_EMAIL!,
      replyTo: email,
      subject: `Yeni kurumsal mindfulness talebi — ${company}`,
      text: [
        `${firstName} ${lastName}, ${company} adına yeni bir kurumsal mindfulness talebi gönderdi.`,
        `E-posta: ${email}`,
        `Not:\n${note}`,
        `Portal: https://portal.pusulamkendim.com/corporate-inquiries/${inquiryId}`,
      ].join('\n\n'),
    });
    await this.sendOnce(`corporate-inquiry-ack:${inquiryId}`, 'CORPORATE_INQUIRY_ACK_EMAIL', {
      to: email,
      replyTo: this.config.ADMIN_ALERT_EMAIL!,
      subject: 'Kurumlar için mindfulness talebiniz ulaştı',
      text: [
        `Merhaba ${firstName},`,
        'Mesajınız bana ulaştı. Kurumunuzun çalışanları için nasıl bir bireysel çalışma düşündüğünüzü inceleyip e-posta üzerinden size döneceğim.',
        'Necip Sülbü\nSakin Zihin',
      ].join('\n\n'),
    });
  }

  destroy(): void {
    this.client.destroy();
  }

  private async sendOnce(
    deliveryKey: string,
    eventType: string,
    message: { to: string; replyTo: string; subject: string; text: string },
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.upsert({
      where: { deliveryKey },
      create: {
        deliveryKey,
        channel: NotificationChannel.EMAIL,
        eventType,
        recipientHmac: createHash('sha256')
          .update(message.to.trim().toLocaleLowerCase('en-US'))
          .digest('hex'),
        status: 'PENDING',
      },
      update: {},
    });
    if (delivery.status === 'SENT') return;
    const staleBefore = new Date(this.clock.now().getTime() - 5 * 60_000);
    const claimed = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        OR: [
          { status: { in: ['PENDING', 'FAILED'] } },
          { status: 'PROCESSING', updatedAt: { lt: staleBefore } },
        ],
      },
      data: { status: 'PROCESSING', attempts: { increment: 1 }, errorCode: null },
    });
    if (!claimed.count) return;
    try {
      const response = await this.client.send(
        new SendEmailCommand({
          FromEmailAddress: this.config.ADMIN_EMAIL_FROM!,
          Destination: { ToAddresses: [message.to] },
          ReplyToAddresses: [message.replyTo],
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: { Text: { Data: message.text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
      if (!response.MessageId) throw new Error('SesMessageIdMissing');
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: { status: 'SENT', providerMessageId: response.MessageId },
      });
    } catch (error) {
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'FAILED',
          errorCode: error instanceof Error ? error.name : 'UnknownError',
        },
      });
      throw error;
    }
  }

  private decrypt(
    id: string,
    field: string,
    ciphertext: Uint8Array | null,
    keyId: string | null,
  ): string {
    if (!ciphertext || !keyId) throw new Error(`Corporate inquiry ${field} is unavailable.`);
    return this.encryption.decrypt(
      { ciphertext: Buffer.from(ciphertext), keyId },
      `corporate-inquiry:${id}:${field}`,
    );
  }
}

export async function purgeExpiredCorporateInquiryData(
  prisma: PrismaClient,
  clock: Clock,
): Promise<number> {
  const result = await prisma.corporateInquiry.updateMany({
    where: {
      status: { in: ['CONTACTED', 'CLOSED'] },
      retentionDeleteAt: { lte: clock.now() },
      personalDataDeletedAt: null,
    },
    data: {
      firstNameEncrypted: null,
      firstNameKeyId: null,
      lastNameEncrypted: null,
      lastNameKeyId: null,
      emailEncrypted: null,
      emailKeyId: null,
      emailHmac: null,
      companyEncrypted: null,
      companyKeyId: null,
      noteEncrypted: null,
      noteKeyId: null,
      sourceIpHmac: null,
      sessionId: null,
      personalDataDeletedAt: clock.now(),
    },
  });
  return result.count;
}
