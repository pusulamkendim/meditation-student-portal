import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  MeditationAudioKind,
  MeditationGuidanceMode,
  MeditationLevel,
  MeditationPublicShareStatus,
  MeditationTypeStatus,
} from '@meditation/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { sendAudio } from './audio-response.js';
import { MeditationService } from './meditation.service.js';

const durationSchema = z.array(z.number().int().min(1).max(180)).min(1).max(12);
const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_000).optional(),
  level: z.nativeEnum(MeditationLevel),
  guidanceMode: z.nativeEnum(MeditationGuidanceMode).default(MeditationGuidanceMode.SILENT),
  targetDurations: durationSchema,
});
const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  level: z.nativeEnum(MeditationLevel).optional(),
  guidanceMode: z.nativeEnum(MeditationGuidanceMode).optional(),
  targetDurations: durationSchema.optional(),
  status: z.nativeEnum(MeditationTypeStatus).optional(),
});
const deleteSchema = z.object({ expectedVersion: z.number().int().positive() });
const publicShareCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .min(3)
    .max(100),
  allowedDurations: durationSchema,
  defaultDurationMinutes: z.number().int().min(1).max(180),
  allowDurationSelection: z.boolean().default(true),
  allowIndexing: z.boolean().default(false),
  expiresAt: z.coerce.date().nullable().optional(),
});
const publicShareUpdateSchema = publicShareCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
  status: z.nativeEnum(MeditationPublicShareStatus).optional(),
});

@Controller('v1/admin/meditations')
@UseGuards(AdminSessionGuard)
export class MeditationController {
  constructor(@Inject(MeditationService) private readonly meditations: MeditationService) {}

  @Get()
  list() {
    return this.meditations.list();
  }

  @Post()
  @UseGuards(AdminCsrfGuard)
  create(@Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz meditasyon bilgileri.');
    return this.meditations.create(parsed.data, request.admin!.id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.meditations.detail(id);
  }

  @Patch(':id')
  @UseGuards(AdminCsrfGuard)
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz meditasyon güncellemesi.');
    return this.meditations.update(id, parsed.data, request.admin!.id);
  }

  @Delete(':id')
  @UseGuards(AdminCsrfGuard)
  remove(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz silme isteği.');
    return this.meditations.remove(id, parsed.data.expectedVersion, request.admin!.id);
  }

  @Get(':id/public-share')
  publicShare(@Param('id') id: string) {
    return this.meditations.publicShareDetail(id);
  }

  @Post(':id/public-share')
  @UseGuards(AdminCsrfGuard)
  createPublicShare(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = publicShareCreateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz paylaşım ayarları.');
    return this.meditations.createPublicShare(id, parsed.data, request.admin!.id);
  }

  @Patch(':id/public-share')
  @UseGuards(AdminCsrfGuard)
  updatePublicShare(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = publicShareUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz paylaşım güncellemesi.');
    return this.meditations.updatePublicShare(id, parsed.data, request.admin!.id);
  }

  @Post(':id/audio/:kind')
  @UseGuards(AdminCsrfGuard)
  async uploadAudio(
    @Param('id') id: string,
    @Param('kind') rawKind: string,
    @Req() request: FastifyRequest,
  ) {
    if (!request.isMultipart()) throw new BadRequestException('multipart/form-data bekleniyor.');
    const kind = z.nativeEnum(MeditationAudioKind).safeParse(rawKind.toLocaleUpperCase('en-US'));
    if (!kind.success) throw new BadRequestException('Geçersiz ses türü.');
    let file: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      if (file) throw new BadRequestException('Her yüklemede tek ses dosyası seçin.');
      file = {
        filename: part.filename,
        mimetype: part.mimetype,
        buffer: await part.toBuffer(),
      };
    }
    if (!file) throw new BadRequestException('Bir MP3 veya M4A dosyası seçin.');
    return this.meditations.uploadAudio(id, kind.data, file, request.admin!.id);
  }

  @Get(':id/audio/:assetId')
  async audio(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.meditations.audio(id, assetId);
    return sendAudio(request, reply, file);
  }

  @Get(':id/renders/:renderId/audio')
  async renderedAudio(
    @Param('id') id: string,
    @Param('renderId') renderId: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.meditations.renderedAudio(id, renderId);
    return sendAudio(request, reply, file);
  }

  @Post(':id/renders/:renderId/retry')
  @UseGuards(AdminCsrfGuard)
  retry(
    @Param('id') id: string,
    @Param('renderId') renderId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.meditations.retryRender(id, renderId, request.admin!.id);
  }
}
