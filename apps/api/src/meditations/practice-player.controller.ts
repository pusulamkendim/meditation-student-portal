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

import { sendAudio } from './audio-response.js';
import { MeditationService } from './meditation.service.js';

const accessSchema = z.union([
  z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{22}$/u) }).strict(),
  z.object({ token: z.string().min(20).max(512) }).strict(),
]);

@Controller('v1/public/practices')
export class PracticePlayerController {
  constructor(@Inject(MeditationService) private readonly meditations: MeditationService) {}

  @Post('access')
  access(@Body() body: unknown) {
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Pratik bağlantısı geçersiz.');
    return 'code' in parsed.data
      ? this.meditations.practiceAccessCode(parsed.data.code)
      : this.meditations.practiceAccess(parsed.data.token);
  }

  @Get('audio/:token')
  async audio(
    @Param('token') token: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.meditations.practiceAudio(token);
    return sendAudio(request, reply, file);
  }
}
