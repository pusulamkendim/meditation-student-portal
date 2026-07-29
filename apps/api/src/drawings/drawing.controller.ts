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
  UseGuards,
} from '@nestjs/common';
import { DrawingStatus } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { DrawingService } from './drawing.service.js';

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(1_000).optional(),
});

const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(1_000).nullable().optional(),
  scene: z.unknown().optional(),
  status: z.nativeEnum(DrawingStatus).optional(),
});
const assignmentSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(200),
});
const accessSchema = z.object({ token: z.string().min(32).max(100) });

@Controller('v1/admin/drawings')
@UseGuards(AdminSessionGuard)
export class DrawingController {
  constructor(@Inject(DrawingService) private readonly drawings: DrawingService) {}

  @Get()
  list() {
    return this.drawings.list();
  }

  @Post()
  @UseGuards(AdminCsrfGuard)
  create(@Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz çizim bilgileri.');
    return this.drawings.createBlank(parsed.data, request.admin!.id);
  }

  @Post('upload')
  @UseGuards(AdminCsrfGuard)
  async upload(@Req() request: FastifyRequest) {
    if (!request.isMultipart()) throw new BadRequestException('multipart/form-data bekleniyor.');
    let file: { filename: string; mimetype: string; buffer: Buffer } | undefined;
    let title: string | undefined;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        if (file) throw new BadRequestException('Her yüklemede tek çizim dosyası seçin.');
        file = {
          filename: part.filename,
          mimetype: part.mimetype,
          buffer: await part.toBuffer(),
        };
      } else if (part.fieldname === 'title') {
        title = String(part.value);
      }
    }
    if (!file) throw new BadRequestException('Bir .excalidraw dosyası seçin.');
    return this.drawings.upload({ ...file, title }, request.admin!.id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.drawings.get(id);
  }

  @Patch(':id')
  @UseGuards(AdminCsrfGuard)
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz çizim güncellemesi.');
    return this.drawings.update(id, parsed.data, request.admin!.id);
  }

  @Post(':id/assignments')
  @UseGuards(AdminCsrfGuard)
  assign(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = assignmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('En az bir öğrenci seçin.');
    return this.drawings.assign(id, parsed.data.studentIds, request.admin!.id);
  }

  @Delete(':id/assignments/:assignmentId')
  @UseGuards(AdminCsrfGuard)
  revoke(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Req() request: FastifyRequest,
  ) {
    return this.drawings.revoke(id, assignmentId, request.admin!.id);
  }

  @Delete(':id')
  @UseGuards(AdminCsrfGuard)
  remove(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.drawings.remove(id, request.admin!.id);
  }
}

@Controller('v1/drawings')
export class PublicDrawingController {
  constructor(@Inject(DrawingService) private readonly drawings: DrawingService) {}

  @Post('access')
  access(@Body() body: unknown) {
    const parsed = accessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz çizim bağlantısı.');
    return this.drawings.access(parsed.data.token);
  }
}
