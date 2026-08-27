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
import { ReadingPublicShareStatus, ReadingStatus } from '@meditation/database';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { sendImage, sendPublicImage } from '../content-images/image-response.js';
import { ReadingService } from './reading.service.js';

const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  author: z.string().max(160).nullable().optional(),
  estimatedMinutes: z.number().int().min(1).max(600).optional(),
  allowAgent: z.boolean().optional(),
  status: z.nativeEnum(ReadingStatus).optional(),
  coverImageAlt: z.string().max(500).nullable().optional(),
});
const coverImageRemoveSchema = z.object({ expectedVersion: z.number().int().positive() });
const assignmentSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
});
const publicShareCreateSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  allowPdf: z.boolean().default(false),
  allowIndexing: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
});
const publicShareUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  slug: publicShareCreateSchema.shape.slug.optional(),
  status: z.nativeEnum(ReadingPublicShareStatus).optional(),
  allowPdf: z.boolean().optional(),
  allowIndexing: z.boolean().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
const tokenSchema = z.object({ token: z.string().min(32).max(100) });
const progressSchema = tokenSchema.extend({
  sectionPosition: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
});
const completeSchema = tokenSchema.extend({
  response: z.string().max(4_000).optional(),
});
const publicVisitorSchema = z.object({
  visitorId: z.string().uuid(),
});
const publicAccessSchema = publicVisitorSchema.extend({
  source: z.string().trim().min(1).max(100).optional(),
  medium: z.string().trim().min(1).max(100).optional(),
  campaign: z.string().trim().min(1).max(160).optional(),
});
const publicProgressSchema = publicVisitorSchema.extend({
  sectionPosition: z.number().int().positive(),
  progressPercent: z.number().int().min(0).max(100),
});

@Controller('v1/admin/readings')
@UseGuards(AdminSessionGuard)
export class AdminReadingController {
  constructor(@Inject(ReadingService) private readonly readings: ReadingService) {}

  @Get()
  list() {
    return this.readings.list();
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.readings.detail(id);
  }

  @Get(':id/cover-image')
  async image(@Param('id') id: string, @Res() reply: FastifyReply) {
    const file = await this.readings.image(id);
    return sendImage(reply, file);
  }

  @Post('upload')
  @UseGuards(AdminCsrfGuard)
  async upload(@Req() request: FastifyRequest) {
    if (!request.isMultipart()) throw new BadRequestException('multipart/form-data bekleniyor.');
    let markdown: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    let pdf: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    let coverImage: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    const fields: Record<string, string> = {};
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'coverImage' && part.filename && buffer.byteLength === 0)
          throw new BadRequestException('Kapak görseli boş olamaz.');
        if (!part.filename || buffer.byteLength === 0) continue;
        const file = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer,
        };
        if (part.fieldname === 'markdown') markdown = file;
        else if (part.fieldname === 'pdf') pdf = file;
        else if (part.fieldname === 'coverImage') coverImage = file;
        else throw new BadRequestException('Bilinmeyen dosya alanı.');
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!markdown && !pdf) throw new BadRequestException('Markdown veya PDF dosyası seçin.');
    const targetSectionCount = Number(fields.targetSectionCount ?? 5);
    const estimatedMinutes = fields.estimatedMinutes ? Number(fields.estimatedMinutes) : undefined;
    if (!Number.isInteger(targetSectionCount) || targetSectionCount < 1 || targetSectionCount > 20)
      throw new BadRequestException('Bölüm sayısı 1 ile 20 arasında olmalıdır.');
    if (
      estimatedMinutes !== undefined &&
      (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 600)
    )
      throw new BadRequestException('Tahmini okuma süresi geçersiz.');
    return this.readings.upload(
      {
        markdown,
        pdf,
        coverImage,
        coverImageAlt: fields.coverImageAlt,
        title: fields.title,
        description: fields.description,
        author: fields.author,
        targetSectionCount,
        estimatedMinutes,
        allowAgent: fields.allowAgent === 'true',
      },
      request.admin!.id,
    );
  }

  @Post(':id/cover-image')
  @UseGuards(AdminCsrfGuard)
  async uploadCoverImage(@Param('id') id: string, @Req() request: FastifyRequest) {
    if (!request.isMultipart()) throw new BadRequestException('multipart/form-data bekleniyor.');
    let file: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    const fields: Record<string, string> = {};
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (part.fieldname !== 'coverImage' || file)
          throw new BadRequestException('Her yüklemede tek kapak görseli seçin.');
        file = { filename: part.filename, mimetype: part.mimetype, buffer: await part.toBuffer() };
      } else {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!file) throw new BadRequestException('Bir kapak görseli seçin.');
    const expectedVersion = Number(fields.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1)
      throw new BadRequestException('Geçersiz okuma sürümü.');
    return this.readings.uploadCoverImage(
      id,
      file,
      fields.coverImageAlt,
      expectedVersion,
      request.admin!.id,
    );
  }

  @Delete(':id/cover-image')
  @UseGuards(AdminCsrfGuard)
  removeCoverImage(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = coverImageRemoveSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz kapak görseli silme isteği.');
    return this.readings.removeCoverImage(id, parsed.data.expectedVersion, request.admin!.id);
  }

  @Patch(':id')
  @UseGuards(AdminCsrfGuard)
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz okuma güncellemesi.');
    return this.readings.update(id, parsed.data, request.admin!.id);
  }

  @Delete(':id')
  @UseGuards(AdminCsrfGuard)
  remove(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.readings.remove(id, request.admin!.id);
  }

  @Post(':id/assignments')
  @UseGuards(AdminCsrfGuard)
  assign(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('En az bir öğrenci seçin.');
    return this.readings.assign(id, parsed.data.studentIds, request.admin!.id);
  }

  @Get(':id/public-share')
  publicShare(@Param('id') id: string) {
    return this.readings.publicShareDetail(id);
  }

  @Post(':id/public-share')
  @UseGuards(AdminCsrfGuard)
  createPublicShare(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = publicShareCreateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Bağlantı adı yalnızca küçük harf, rakam ve tire içermelidir.');
    return this.readings.createPublicShare(
      id,
      {
        ...parsed.data,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      },
      request.admin!.id,
    );
  }

  @Patch(':id/public-share')
  @UseGuards(AdminCsrfGuard)
  updatePublicShare(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ) {
    const parsed = publicShareUpdateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz herkese açık paylaşım ayarı.');
    return this.readings.updatePublicShare(
      id,
      {
        ...parsed.data,
        expiresAt:
          parsed.data.expiresAt === undefined
            ? undefined
            : parsed.data.expiresAt
              ? new Date(parsed.data.expiresAt)
              : null,
      },
      request.admin!.id,
    );
  }
}

@Controller('v1/readings')
export class PublicReadingController {
  constructor(@Inject(ReadingService) private readonly readings: ReadingService) {}

  @Post('access')
  access(@Body() body: unknown) {
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz okuma bağlantısı.');
    return this.readings.access(parsed.data.token);
  }

  @Post('progress')
  progress(@Body() body: unknown) {
    const parsed = progressSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz ilerleme bilgisi.');
    return this.readings.progress(
      parsed.data.token,
      parsed.data.sectionPosition,
      parsed.data.progressPercent,
    );
  }

  @Post('complete')
  complete(@Body() body: unknown) {
    const parsed = completeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz değerlendirme.');
    return this.readings.complete(parsed.data.token, parsed.data.response);
  }

  @Post('pdf')
  async pdf(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const parsed = tokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz okuma bağlantısı.');
    const result = await this.readings.pdf(parsed.data.token);
    reply.header('content-type', 'application/pdf');
    reply.header(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    return result.buffer;
  }

  @Get('public/:slug/meta')
  publicMeta(@Param('slug') slug: string, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return this.readings.publicMeta(slug);
  }

  @Get('public/:slug/image')
  async publicImage(
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.readings.publicImage(slug);
    return sendPublicImage(request, reply, file);
  }

  @Get('public/:slug/content')
  publicContent(@Param('slug') slug: string, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('cache-control', 'public, max-age=60, stale-while-revalidate=300');
    return this.readings.publicContent(slug);
  }

  @Post('public/:slug/access')
  publicAccess(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = publicAccessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz anonim okuma oturumu.');
    return this.readings.publicAccess(slug, parsed.data.visitorId, {
      source: parsed.data.source,
      medium: parsed.data.medium,
      campaign: parsed.data.campaign,
    });
  }

  @Post('public/:slug/progress')
  publicProgress(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = publicProgressSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz okuma ilerlemesi.');
    return this.readings.publicProgress(
      slug,
      parsed.data.visitorId,
      parsed.data.sectionPosition,
      parsed.data.progressPercent,
    );
  }

  @Post('public/:slug/heartbeat')
  publicHeartbeat(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = publicVisitorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz anonim okuma oturumu.');
    return this.readings.publicHeartbeat(slug, parsed.data.visitorId);
  }

  @Post('public/:slug/complete')
  publicComplete(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = publicVisitorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz anonim okuma oturumu.');
    return this.readings.publicComplete(slug, parsed.data.visitorId);
  }

  @Post('public/:slug/whatsapp-click')
  publicWhatsappClick(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = publicVisitorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz anonim okuma oturumu.');
    return this.readings.publicWhatsappClick(slug, parsed.data.visitorId);
  }

  @Post('public/:slug/pdf')
  async publicPdf(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const parsed = publicVisitorSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz anonim okuma oturumu.');
    const result = await this.readings.publicPdf(slug, parsed.data.visitorId);
    reply.header('content-type', 'application/pdf');
    reply.header(
      'content-disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    return result.buffer;
  }
}
