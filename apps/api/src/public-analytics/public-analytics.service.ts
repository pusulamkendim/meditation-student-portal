import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service.js';

export type PublicAnalyticsEventInput = {
  event: string;
  sessionId: string;
  pathname: string;
  slug?: string;
  location?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

function safeReferrer(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 2_048);
  } catch {
    return undefined;
  }
}

@Injectable()
export class PublicAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: PublicAnalyticsEventInput): Promise<void> {
    await this.prisma.publicAnalyticsEvent.create({
      data: {
        eventName: input.event,
        sessionId: input.sessionId,
        pathname: input.pathname,
        slug: input.slug,
        location: input.location,
        source: input.utm_source,
        medium: input.utm_medium,
        campaign: input.utm_campaign,
        referrer: safeReferrer(input.referrer),
      },
    });
  }
}
