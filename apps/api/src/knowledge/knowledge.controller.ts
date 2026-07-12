import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { knowledgeStageSchema } from '@meditation/core';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { KnowledgeService } from './knowledge.service.js';

const baseSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).optional(),
});
const statusSchema = z.object({ status: z.enum(['PUBLISHED', 'ARCHIVED']) });
const retrievalSchema = z.object({
  topK: z.number().int().min(1).max(100),
  finalChunks: z.number().int().min(1).max(20),
  minScore: z.number().min(0).max(1),
  maxContextChars: z.number().int().min(1000).max(50000),
  vectorWeight: z.number().min(0).max(1),
  keywordWeight: z.number().min(0).max(1),
  maxChunksPerDocument: z.number().int().min(1).max(10),
});

@Controller('v1/admin/knowledge')
@UseGuards(AdminSessionGuard)
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Get('bases') listBases() {
    return this.service.listBases();
  }

  @Post('bases')
  @UseGuards(AdminCsrfGuard)
  createBase(@Body() body: unknown) {
    const parsed = baseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz bilgi bankası payloadı.');
    return this.service.createBase(parsed.data);
  }

  @Get('bases/:baseId/documents') listDocuments(@Param('baseId') baseId: string) {
    return this.service.listDocuments(baseId);
  }

  @Post('bases/:baseId/documents/upload')
  @UseGuards(AdminCsrfGuard)
  async upload(@Param('baseId') baseId: string, @Req() request: FastifyRequest) {
    if (!request.isMultipart()) throw new BadRequestException('multipart/form-data bekleniyor.');
    const files: Array<{ filename: string; mimetype: string; buffer: Buffer }> = [];
    let logicalName: string | undefined;
    let stages: string[] = [];
    let total = 0;
    for await (const part of request.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        total += buffer.byteLength;
        if (total > 100 * 1024 * 1024)
          throw new BadRequestException('İstek toplam boyutu 100 MiB sınırını aşıyor.');
        files.push({ filename: part.filename, mimetype: part.mimetype, buffer });
      } else if (part.fieldname === 'logicalName') logicalName = String(part.value);
      else if (part.fieldname === 'stages') {
        try {
          stages = Array.isArray(part.value)
            ? part.value.map(String)
            : JSON.parse(String(part.value));
        } catch {
          throw new BadRequestException('stages JSON formatında olmalıdır.');
        }
      }
    }
    if (!stages.length) stages = ['GENERAL'];
    if (stages.some((stage) => !knowledgeStageSchema.safeParse(stage).success))
      throw new BadRequestException('Geçersiz bilgi bankası aşaması.');
    return this.service.upload({ baseId, logicalName, stages, files });
  }

  @Get('versions/:versionId') getVersion(@Param('versionId') versionId: string) {
    return this.service.getVersion(versionId);
  }
  @Get('versions/:versionId/signed-url') signedUrl(@Param('versionId') versionId: string) {
    return this.service.signedUrl(versionId);
  }

  @Post('versions/:versionId/status')
  @UseGuards(AdminCsrfGuard)
  setStatus(@Param('versionId') versionId: string, @Body() body: unknown) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz belge durumu.');
    return this.service.setStatus(versionId, parsed.data.status);
  }

  @Post('versions/:versionId/reindex')
  @UseGuards(AdminCsrfGuard)
  reindex(@Param('versionId') versionId: string) {
    return this.service.reindex(versionId);
  }

  @Get('search') search(@Query('q') query?: string, @Query('stage') stage?: string) {
    if (!query?.trim()) throw new BadRequestException('Arama sorusu gereklidir.');
    return this.service.testSearch(query.trim(), stage);
  }

  @Get('retrieval-config') retrievalConfig() {
    return this.service.retrievalConfig();
  }

  @Post('retrieval-config')
  @UseGuards(AdminCsrfGuard)
  updateRetrievalConfig(@Body() body: unknown) {
    const parsed = retrievalSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz retrieval ayarı.');
    return this.service.updateRetrievalConfig(parsed.data);
  }

  @Get('handoffs') handoffs(@Query('status') status?: string) {
    if (status && status !== 'OPEN' && status !== 'RESOLVED')
      throw new BadRequestException('Geçersiz handoff durumu.');
    return this.service.handoffs(status as 'OPEN' | 'RESOLVED' | undefined);
  }

  @Post('handoffs/:id/resolve')
  @UseGuards(AdminCsrfGuard)
  resolve(@Param('id') id: string, @Req() request: FastifyRequest) {
    return this.service.resolveHandoff(id, request.admin!.id);
  }
}
