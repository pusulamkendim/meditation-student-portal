import {
  BadRequestException,
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import { z } from 'zod';

import {
  PublicAnalyticsService,
  type PublicAnalyticsEventInput,
} from './public-analytics.service.js';

const eventNames = [
  'page_view',
  'landing_view',
  'reading_view',
  'reading_cta_click',
  'meditation_view',
  'meditation_start',
  'meditation_complete',
  'one_to_one_page_view',
  'one_to_one_cta_click',
  'whatsapp_click',
  'intro_call_click',
] as const;

const eventSchema = z
  .object({
    event: z.enum(eventNames),
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/u),
    pathname: z.string().trim().min(1).max(2_048),
    slug: z.string().trim().min(1).max(200).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    utm_source: z.string().trim().min(1).max(100).optional(),
    utm_medium: z.string().trim().min(1).max(100).optional(),
    utm_campaign: z.string().trim().min(1).max(160).optional(),
    referrer: z.string().url().max(2_048).optional(),
  })
  .strict();

@Controller('v1/public/analytics')
export class PublicAnalyticsController {
  constructor(@Inject(PublicAnalyticsService) private readonly analytics: PublicAnalyticsService) {}

  @Post('events')
  @Header('cache-control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  async event(@Body() body: unknown): Promise<void> {
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz analytics olayı.');
    await this.analytics.record(parsed.data as PublicAnalyticsEventInput);
  }
}
