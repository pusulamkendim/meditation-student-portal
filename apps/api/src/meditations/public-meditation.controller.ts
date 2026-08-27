import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { sendPublicImage } from '../content-images/image-response.js';
import { sendAudio } from './audio-response.js';
import { MeditationService } from './meditation.service.js';

const attribution = z.string().trim().min(1).max(100).optional();
const accessSchema = z
  .object({
    visitorId: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/u),
    durationMinutes: z.number().int().min(1).max(180).optional(),
    source: attribution,
    medium: attribution,
    campaign: attribution,
  })
  .strict();
const eventSchema = z
  .object({
    token: z.string().min(40).max(1_000),
    event: z.enum(['START', 'COMPLETE', 'CTA_VIEW', 'CTA_CLICK']),
  })
  .strict();

@Controller('v1/public/meditations')
export class PublicMeditationController {
  constructor(@Inject(MeditationService) private readonly meditations: MeditationService) {}

  @Post(':slug/access')
  access(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz meditasyon erişim isteği.');
    return this.meditations.publicMeditationAccess(slug, parsed.data);
  }

  @Get(':slug/meta')
  meta(@Param('slug') slug: string) {
    return this.meditations.publicMeditationMeta(slug);
  }

  @Get(':slug/image')
  async image(
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.meditations.publicMeditationImage(slug);
    return sendPublicImage(request, reply, file);
  }

  @Post('events')
  event(@Body() body: unknown) {
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz meditasyon olayı.');
    return this.meditations.recordPublicMeditationEvent(parsed.data.token, parsed.data.event);
  }

  @Get('audio/:token')
  async audio(
    @Param('token') token: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.meditations.publicMeditationAudio(token);
    return sendAudio(request, reply, file);
  }
}
