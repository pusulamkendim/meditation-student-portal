import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CorporateInquiryStatus } from '@meditation/database';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import {
  CorporateInquiriesService,
  CorporateInquiryRateLimitError,
} from './corporate-inquiries.service.js';

const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const publicInquirySchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(320),
    company: z.string().trim().min(2).max(200),
    note: z.string().trim().min(10).max(4_000),
    privacyNoticeAccepted: z.literal(true),
    sessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,100}$/u)
      .optional(),
    utm_source: optionalText(100),
    utm_medium: optionalText(100),
    utm_campaign: optionalText(160),
    website: z.string().max(500).optional(),
  })
  .strict();
const statusSchema = z.object({ status: z.nativeEnum(CorporateInquiryStatus) }).strict();

@Controller('v1/public/corporate-inquiries')
export class PublicCorporateInquiriesController {
  constructor(
    @Inject(CorporateInquiriesService) private readonly inquiries: CorporateInquiriesService,
  ) {}

  @Post()
  @Header('cache-control', 'no-store')
  @HttpCode(HttpStatus.ACCEPTED)
  async create(@Body() body: unknown, @Req() request: FastifyRequest) {
    const parsed = publicInquirySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Lütfen form alanlarını kontrol edin.');
    if (parsed.data.website?.trim()) return { received: true } as const;
    try {
      await this.inquiries.create(parsed.data, request.ip);
      return { received: true } as const;
    } catch (error) {
      if (error instanceof CorporateInquiryRateLimitError) {
        throw new HttpException(
          'Çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }
}

@Controller('v1/admin/corporate-inquiries')
@UseGuards(AdminSessionGuard)
export class AdminCorporateInquiriesController {
  constructor(
    @Inject(CorporateInquiriesService) private readonly inquiries: CorporateInquiriesService,
  ) {}

  @Get()
  async list() {
    return { items: await this.inquiries.list() };
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Req() request: FastifyRequest) {
    const result = await this.inquiries.detail(id);
    await this.inquiries.auditView(request.admin!.id, id);
    return result;
  }

  @Patch(':id/status')
  @UseGuards(AdminCsrfGuard)
  async updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Geçersiz talep durumu.');
    return this.inquiries.updateStatus(id, parsed.data.status);
  }
}
