import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable } from '@nestjs/common';

import type { AdminEmailAdapter, AdminEmailMessage } from './admin-email.adapter.js';

@Injectable()
export class SesAdminEmailAdapter implements AdminEmailAdapter {
  private readonly client: SESv2Client;

  constructor(
    private readonly from: string,
    private readonly recipient: string,
    region: string,
  ) {
    this.client = new SESv2Client({ region });
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
}
