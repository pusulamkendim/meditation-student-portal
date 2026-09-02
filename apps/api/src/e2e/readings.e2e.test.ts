import multipart from '@fastify/multipart';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  CLOCK_TOKEN,
  FakeClock,
  loadApplicationConfig,
  type ApplicationConfig,
  type SystemEventKey,
} from '@meditation/core';
import { PrismaClient } from '@meditation/database';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';
import { AdminReadingController, PublicReadingController } from '../readings/reading.controller.js';
import {
  createReadingStorage,
  READING_STORAGE,
  ReadingService,
} from '../readings/reading.service.js';

const runE2e = process.env.RUN_READING_E2E === 'true';

function multipartBody(markdown: string, pdf?: Buffer) {
  const boundary = `----reading-e2e-${randomUUID()}`;
  const prefix =
    `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nE2E Okuma\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="author"\r\n\r\nNecip Sülbü\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="targetSectionCount"\r\n\r\n2\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="markdown"; filename="e2e.md"\r\nContent-Type: text/markdown\r\n\r\n${markdown}\r\n`;
  if (!pdf)
    return {
      boundary,
      payload: Buffer.from(
        `${prefix}--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename=""\r\nContent-Type: application/octet-stream\r\n\r\n\r\n--${boundary}--\r\n`,
      ),
    };
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(
        `${prefix}--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="e2e-main.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

function minimalPdf(lines: string[]): Buffer {
  const commands = lines
    .map((line, index) => `${index ? '0 -24 Td ' : ''}(${line.replace(/[()\\]/gu, '\\$&')}) Tj`)
    .join('\r\n');
  const stream = `BT\r\n/F1 12 Tf\r\n72 720 Td\r\n${commands}\r\nET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\r\nstream\r\n${stream}\r\nendstream`,
  ];
  let body = '%PDF-1.4\r\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\r\n${object}\r\nendobj\r\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\r\n0 ${objects.length + 1}\r\n0000000000 65535 f\r\n`;
  const detectedStreamOrigin = Buffer.byteLength('\r\n');
  body += offsets
    .slice(1)
    // pdf-parse 1.x resolves this in-memory fixture relative to its detected
    // stream origin, so xref entries must use that same origin.
    .map((offset) => `${String(offset - detectedStreamOrigin).padStart(10, '0')} 00000 n\r\n`)
    .join('');
  body += `trailer\r\n<< /Size ${objects.length + 1} /Root 1 0 R >>\r\nstartxref\r\n${xrefOffset}\r\n%%EOF\r\n`;
  return Buffer.from(body);
}

function pdfOnlyMultipartBody(pdf: Buffer) {
  const boundary = `----reading-pdf-e2e-${randomUUID()}`;
  return {
    boundary,
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nPDF E2E Okuma\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="targetSectionCount"\r\n\r\n2\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="markdown"; filename=""\r\nContent-Type: application/octet-stream\r\n\r\n\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="e2e.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
      ),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

describe.runIf(runE2e)('E2E-READINGS student reading flow', () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const tokenKey = randomBytes(48).toString('base64');
  const encryptionKey = randomBytes(32).toString('base64');
  const clock = new FakeClock('2026-07-29T15:00:00.000Z');
  const orchestrator = {
    createIntent: vi.fn(async (input: { eventKey: SystemEventKey }) => ({
      occurrenceId: randomUUID(),
      intentId: (
        await prisma.messageIntent.create({
          data: {
            studentId,
            channelIdentityId,
            category: input.eventKey,
            idempotencyKey: `reading-e2e:${randomUUID()}`,
            dueAt: new Date(),
            expiresAt: new Date('2099-01-01T00:00:00.000Z'),
            aggregateVersion: 1,
            payload: { eventKey: input.eventKey },
          },
        })
      ).id,
    })),
  };
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let storageRoot: string;
  let adminId: string;
  let studentId: string;
  let channelAccountId: string;
  let channelIdentityId: string;
  let readingId: string;
  let pdfReadingId: string;
  let assignmentId: string;
  let accessToken: string;
  const publicSlug = `e2e-okuma-${randomUUID()}`;
  const publicVisitorId = randomUUID();

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'meditation-readings-e2e-'));
    process.env.KNOWLEDGE_LOCAL_STORAGE_DIR = storageRoot;
    const config = loadApplicationConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      ADMIN_ORIGIN: 'http://localhost:3001',
      DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: encryptionKey }),
      ACTIVE_DATA_KEY_ID: 'test',
      LOOKUP_HMAC_KEY: tokenKey,
      R2_PRIVATE_BUCKET: 'e2e-readings',
    }) as ApplicationConfig;
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    adminId = (await prisma.adminUser.findFirstOrThrow({ select: { id: true } })).id;
    channelAccountId = (
      await prisma.channelAccount.create({
        data: {
          type: 'TELEGRAM',
          displayName: 'Reading E2E',
          externalId: `reading-e2e-${randomUUID()}`,
          active: true,
        },
      })
    ).id;
    studentId = (
      await prisma.student.create({
        data: { status: 'ACTIVE', registrationStep: 'COMPLETE' },
      })
    ).id;
    channelIdentityId = (
      await prisma.studentChannelIdentity.create({
        data: {
          studentId,
          channelAccountId,
          externalUserEncrypted: Buffer.from('student'),
          externalUserKeyId: 'test',
          externalUserHmac: randomUUID(),
          status: 'ACTIVE',
          verifiedAt: new Date(),
        },
      })
    ).id;
    await prisma.student.update({
      where: { id: studentId },
      data: { defaultChannelIdentityId: channelIdentityId },
    });

    const module = await Test.createTestingModule({
      controllers: [AdminReadingController, PublicReadingController],
      providers: [
        ReadingService,
        PrismaService,
        { provide: APPLICATION_CONFIG, useValue: config },
        { provide: READING_STORAGE, useValue: createReadingStorage(config) },
        { provide: SystemMessageOrchestrator, useValue: orchestrator },
        { provide: CLOCK_TOKEN, useValue: clock },
      ],
    })
      .overrideGuard(AdminSessionGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().admin = { id: adminId };
          return true;
        },
      })
      .overrideGuard(AdminCsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 30 * 1024 * 1024 }),
    );
    await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 2 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (readingId || pdfReadingId || assignmentId)
      await prisma.auditLog.deleteMany({
        where: {
          entityType: 'Reading',
          entityId: { in: [readingId, pdfReadingId, assignmentId].filter(Boolean) },
        },
      });
    if (readingId || pdfReadingId)
      await prisma.reading.deleteMany({
        where: { id: { in: [readingId, pdfReadingId].filter(Boolean) } },
      });
    if (studentId) {
      await prisma.message.deleteMany({ where: { studentId } });
      await prisma.messageIntent.deleteMany({ where: { studentId } });
      await prisma.student.updateMany({
        where: { id: studentId },
        data: { defaultChannelIdentityId: null },
      });
      await prisma.studentChannelIdentity.deleteMany({ where: { studentId } });
      await prisma.student.deleteMany({ where: { id: studentId } });
    }
    if (channelAccountId)
      await prisma.channelAccount.deleteMany({ where: { id: channelAccountId } });
    await app?.close();
    await prisma?.$disconnect();
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.KNOWLEDGE_LOCAL_STORAGE_DIR;
  });

  it('uploads, publishes and assigns a sectioned reading', async () => {
    const upload = multipartBody(
      '# E2E\n\n## İlk bölüm\n\nİlk içerik.\n\n## İkinci bölüm\n\nİkinci içerik.',
      minimalPdf(['Public reading PDF content.']),
    );
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/readings/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${upload.boundary}` },
      payload: upload.payload,
    });
    expect(created.statusCode).toBe(201);
    readingId = created.json().id as string;
    expect(created.json().sections).toHaveLength(2);

    const published = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/readings/${readingId}`,
      payload: { expectedVersion: 1, status: 'PUBLISHED' },
    });
    expect(published.statusCode).toBe(200);

    const assigned = await app.inject({
      method: 'POST',
      url: `/v1/admin/readings/${readingId}/assignments`,
      payload: { studentIds: [studentId] },
    });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json().items[0]).toMatchObject({ sent: true, studentId });
    assignmentId = assigned.json().items[0].assignmentId as string;
    accessToken = new URL(assigned.json().items[0].readingUrl as string).hash.slice(1);
    expect(accessToken.length).toBeGreaterThan(32);
  });

  it('accepts a PDF without requiring a Markdown file', async () => {
    const upload = pdfOnlyMultipartBody(
      minimalPdf([
        'First paragraph about awareness and breathing.',
        'Second paragraph about attention and balance.',
        'Third paragraph about insight and compassion.',
        'Fourth paragraph about practice and reflection.',
      ]),
    );
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/readings/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${upload.boundary}` },
      payload: upload.payload,
    });

    expect(created.statusCode).toBe(201);
    pdfReadingId = created.json().id as string;
    expect(created.json()).toMatchObject({
      title: 'PDF E2E Okuma',
      pdfFilename: 'e2e.pdf',
    });
    expect(created.json().sections).toHaveLength(2);
  });

  it('publishes an anonymous public link and measures Instagram reading activity', async () => {
    const created = await app.inject({
      method: 'POST',
      url: `/v1/admin/readings/${readingId}/public-share`,
      payload: {
        slug: publicSlug,
        allowPdf: true,
        allowIndexing: false,
        expiresAt: null,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      slug: publicSlug,
      status: 'ACTIVE',
      publicUrl: `http://localhost:3001/oku/${publicSlug}`,
      metrics: { totalViews: 0, uniqueReaders: 0 },
    });

    const meta = await app.inject({
      method: 'GET',
      url: `/v1/readings/public/${publicSlug}/meta`,
    });
    expect(meta.statusCode).toBe(200);
    expect(meta.json()).toMatchObject({
      title: 'E2E Okuma',
      allowIndexing: false,
      canonicalUrl: `http://localhost:3001/oku/${publicSlug}`,
    });

    const content = await app.inject({
      method: 'GET',
      url: `/v1/readings/public/${publicSlug}/content`,
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers['cache-control']).toContain('public');
    expect(content.json()).toMatchObject({
      slug: publicSlug,
      title: 'E2E Okuma',
      hasPdf: true,
      sections: [{ position: 1 }, { position: 2 }],
    });
    expect(content.json()).not.toHaveProperty('studentFirstName');
    expect(content.json()).not.toHaveProperty('response');

    for (let view = 0; view < 2; view += 1) {
      const opened = await app.inject({
        method: 'POST',
        url: `/v1/readings/public/${publicSlug}/access`,
        payload: {
          visitorId: publicVisitorId,
          source: 'instagram',
          medium: 'social',
        },
      });
      expect(opened.statusCode).toBe(201);
      expect(opened.json()).toMatchObject({
        title: 'E2E Okuma',
        hasPdf: true,
        sections: [{ position: 1 }, { position: 2 }],
      });
      expect(opened.json()).not.toHaveProperty('studentFirstName');
      expect(opened.json()).not.toHaveProperty('response');
    }

    const progress = await app.inject({
      method: 'POST',
      url: `/v1/readings/public/${publicSlug}/progress`,
      payload: { visitorId: publicVisitorId, sectionPosition: 2, progressPercent: 80 },
    });
    expect(progress.statusCode).toBe(201);

    const heartbeat = await app.inject({
      method: 'POST',
      url: `/v1/readings/public/${publicSlug}/heartbeat`,
      payload: { visitorId: publicVisitorId },
    });
    expect(heartbeat.json()).toEqual({ saved: true });

    const activeStatistics = await app.inject({
      method: 'GET',
      url: `/v1/admin/readings/${readingId}/public-share`,
    });
    expect(activeStatistics.json().metrics).toMatchObject({
      activeReaders: 1,
      completedReaders: 0,
    });

    const completed = await app.inject({
      method: 'POST',
      url: `/v1/readings/public/${publicSlug}/complete`,
      payload: { visitorId: publicVisitorId },
    });
    expect(completed.json()).toEqual({ completed: true });

    const statistics = await app.inject({
      method: 'GET',
      url: `/v1/admin/readings/${readingId}/public-share`,
    });
    expect(statistics.statusCode).toBe(200);
    expect(statistics.json().metrics).toMatchObject({
      totalViews: 2,
      uniqueReaders: 1,
      activeReaders: 0,
      completedReaders: 1,
      completionRate: 100,
      averageProgress: 100,
      sources: [
        {
          source: 'instagram',
          medium: 'social',
          uniqueReaders: 1,
          totalViews: 2,
        },
      ],
    });
    const visit = await prisma.readingPublicVisit.findFirstOrThrow({
      where: { share: { readingId } },
    });
    expect(visit.visitorHmac).not.toContain(publicVisitorId);

    for (let download = 0; download < 2; download += 1) {
      const pdf = await app.inject({
        method: 'POST',
        url: `/v1/readings/public/${publicSlug}/pdf`,
        payload: { visitorId: publicVisitorId },
      });
      expect(pdf.statusCode).toBe(201);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    }
    const whatsapp = await app.inject({
      method: 'POST',
      url: `/v1/readings/public/${publicSlug}/whatsapp-click`,
      payload: { visitorId: publicVisitorId },
    });
    expect(whatsapp.json()).toEqual({ saved: true });
    const actionStatistics = await app.inject({
      method: 'GET',
      url: `/v1/admin/readings/${readingId}/public-share`,
    });
    expect(actionStatistics.json().metrics).toMatchObject({
      totalPdfDownloads: 2,
      whatsappClicks: 1,
    });
  });

  it('can pause and reopen the public link without affecting student assignments', async () => {
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/readings/${readingId}/public-share`,
    });
    const paused = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/readings/${readingId}/public-share`,
      payload: { expectedVersion: detail.json().version, status: 'PAUSED' },
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({ status: 'PAUSED', effectiveStatus: 'PAUSED' });

    const blocked = await app.inject({
      method: 'POST',
      url: `/v1/readings/public/${publicSlug}/access`,
      payload: { visitorId: randomUUID() },
    });
    expect(blocked.statusCode).toBe(404);

    const reopened = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/readings/${readingId}/public-share`,
      payload: { expectedVersion: paused.json().version, status: 'ACTIVE' },
    });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({ status: 'ACTIVE', effectiveStatus: 'ACTIVE' });
    expect(
      await prisma.readingAssignment.findUnique({
        where: { readingId_studentId: { readingId, studentId } },
      }),
    ).toBeTruthy();
  });

  it('permanently deletes an unassigned reading', async () => {
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/readings/${pdfReadingId}`,
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ id: pdfReadingId, deleted: true });
    expect(await prisma.reading.findUnique({ where: { id: pdfReadingId } })).toBeNull();
    pdfReadingId = '';
  });

  it('refuses to delete a reading that has student assignments', async () => {
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/readings/${readingId}`,
    });
    expect(deleted.statusCode).toBe(409);
    expect(deleted.json().message).toContain('Öğrenciye atanmış');
    expect(await prisma.reading.findUnique({ where: { id: readingId } })).toBeTruthy();
  });

  it('opens, advances and completes the assigned reading with an encrypted response', async () => {
    const opened = await app.inject({
      method: 'POST',
      url: '/v1/readings/access',
      payload: { token: accessToken },
    });
    expect(opened.statusCode).toBe(201);
    expect(opened.json()).toMatchObject({
      title: 'E2E Okuma',
      sections: [{ position: 1 }, { position: 2 }],
    });

    const progress = await app.inject({
      method: 'POST',
      url: '/v1/readings/progress',
      payload: { token: accessToken, sectionPosition: 2, progressPercent: 80 },
    });
    expect(progress.statusCode).toBe(201);

    const completed = await app.inject({
      method: 'POST',
      url: '/v1/readings/complete',
      payload: { token: accessToken, response: 'Bende orta yol düşüncesi kaldı.' },
    });
    expect(completed.statusCode).toBe(201);
    const assignment = await prisma.readingAssignment.findUniqueOrThrow({
      where: { readingId_studentId: { readingId, studentId } },
    });
    expect(assignment).toMatchObject({ status: 'COMPLETED', progressPercent: 100 });
    expect(assignment.responseEncrypted).toBeTruthy();
    expect(Buffer.from(assignment.responseEncrypted!).toString('utf8')).not.toContain('orta yol');
    expect(orchestrator.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'READING_COMPLETED_ACK' }),
    );
  });
});
