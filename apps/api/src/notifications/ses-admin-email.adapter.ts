import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ApplicationConfig } from '@meditation/core';

import type { AdminEmailAdapter, AdminEmailMessage } from './admin-email.adapter.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';

@Injectable()
export class SesAdminEmailAdapter implements AdminEmailAdapter, OnModuleDestroy {
  private readonly client: SESv2Client;

  private readonly from: string;
  private readonly recipient: string;

  constructor(@Inject(APPLICATION_CONFIG) config: ApplicationConfig) {
    if (!config.ADMIN_EMAIL_FROM || !config.ADMIN_ALERT_EMAIL) {
      throw new Error('ADMIN_EMAIL_FROM and ADMIN_ALERT_EMAIL are required.');
    }
    this.from = config.ADMIN_EMAIL_FROM;
    this.recipient = config.ADMIN_ALERT_EMAIL;
    this.client = new SESv2Client({ region: config.AWS_SES_REGION });
  }

  async send(message: AdminEmailMessage): Promise<{ providerMessageId: string }> {
    const body = [
      message.summary,
      `Referans: ${message.pseudonymousReference}`,
      `Admin: ${message.adminUrl}`,
    ].join('\n\n');
    const response = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [this.recipient] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: body, Charset: 'UTF-8' } },
          },
        },
      }),
    );
    if (!response.MessageId) throw new Error('AWS SES accepted the request without a message id.');
    return { providerMessageId: response.MessageId };
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
