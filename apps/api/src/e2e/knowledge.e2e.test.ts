import multipart from '@fastify/multipart';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { FakeClock, loadApplicationConfig, type ApplicationConfig } from '@meditation/core';
import { PrismaClient } from '@meditation/database';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { KnowledgeIngestionProcessor } from '../../../worker/src/knowledge-ingestion.js';
import { AdminCsrfGuard } from '../auth/admin-csrf.guard.js';
import { AdminSessionGuard } from '../auth/admin-session.guard.js';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { KnowledgeController } from '../knowledge/knowledge.controller.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';

const runE2e = process.env.RUN_KNOWLEDGE_E2E === 'true';

type UploadedVersion = { id: string; status: string; documentId: string };

function multipartBody(input: {
  fields?: Record<string, string>;
  filename: string;
  contentType?: string;
  content: string;
}) {
  const boundary = `----knowledge-e2e-${randomUUID()}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(input.fields ?? {})) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${input.filename}"\r\nContent-Type: ${input.contentType ?? 'text/plain'}\r\n\r\n`,
    ),
    Buffer.from(input.content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { boundary, payload: Buffer.concat(parts) };
}

describe.runIf(runE2e)('E2E-KNOWLEDGE knowledge management', () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const clock = new FakeClock('2026-07-16T09:00:00.000Z');
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let processor: KnowledgeIngestionProcessor;
  let clamServer: Server;
  let storageRoot: string;
  let baseId: string;
  let introduction: UploadedVersion;
  let intermediate: UploadedVersion;
  let advanced: UploadedVersion;

  async function upload(input: {
    filename: string;
    content: string;
    stage: string;
    logicalName?: string;
    contentType?: string;
  }) {
    const body = multipartBody({
      filename: input.filename,
      content: input.content,
      contentType: input.contentType,
      fields: {
        stages: JSON.stringify([input.stage]),
        ...(input.logicalName ? { logicalName: input.logicalName } : {}),
      },
    });
    return app.inject({
      method: 'POST',
      url: `/v1/admin/knowledge/bases/${baseId}/documents/upload`,
      headers: { 'content-type': `multipart/form-data; boundary=${body.boundary}` },
      payload: body.payload,
    });
  }

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'meditation-knowledge-e2e-'));
    process.env.KNOWLEDGE_LOCAL_STORAGE_DIR = storageRoot;
    clamServer = createServer((socket) => {
      socket.once('data', () => socket.end('stream: OK\0'));
    });
    await new Promise<void>((resolve) => clamServer.listen(0, '127.0.0.1', resolve));
    const address = clamServer.address();
    if (!address || typeof address === 'string') throw new Error('ClamAV test server failed.');
    const config = loadApplicationConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ e2e: Buffer.alloc(32, 21).toString('base64') }),
      ACTIVE_DATA_KEY_ID: 'e2e',
      LOOKUP_HMAC_KEY: Buffer.alloc(32, 22).toString('base64'),
      GEMINI_API_KEY: 'e2e-gemini-key',
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: String(address.port),
      R2_QUARANTINE_BUCKET: 'e2e-staging',
      R2_PRIVATE_BUCKET: 'e2e-private',
    }) as ApplicationConfig;
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    await prisma.featureFlagConfig.update({
      where: { key: 'knowledge.ingestion.enabled' },
      data: { enabled: true, rolloutPercentage: 100 },
    });
    await prisma.llmProvider.update({
      where: { adapterId: 'gemini' },
      data: { status: 'ENABLED' },
    });
    await prisma.llmTaskConfig.update({
      where: { task: 'KNOWLEDGE_EMBEDDING' },
      data: { enabled: true },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              embedding: {
                values: Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0)),
              },
              usageMetadata: { promptTokenCount: 24 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const module = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [
        KnowledgeService,
        PrismaService,
        { provide: APPLICATION_CONFIG, useValue: config },
      ],
    })
      .overrideGuard(AdminSessionGuard)
      .useValue({
        canActivate: (context: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          context.switchToHttp().getRequest().admin = {
            id: '00000000-0000-4000-8000-000000000001',
          };
          return true;
        },
      })
      .overrideGuard(AdminCsrfGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 100 * 1024 * 1024 }),
    );
    await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 20, parts: 40 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    processor = new KnowledgeIngestionProcessor(prisma, config, clock);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await prisma?.$disconnect();
    await new Promise<void>((resolve) => clamServer?.close(() => resolve()));
    await rm(storageRoot, { recursive: true, force: true });
    delete process.env.KNOWLEDGE_LOCAL_STORAGE_DIR;
  });

  it('creates and lists a knowledge base', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/knowledge/bases',
      payload: { name: 'E2E Meditasyon Kaynakları', description: 'Üç seviyeli test bankası' },
    });
    expect(created.statusCode).toBe(201);
    baseId = created.json().id as string;
    const listed = await app.inject({ method: 'GET', url: '/v1/admin/knowledge/bases' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: baseId })]),
    );
  });

  it('uploads Introduction content directly into processing without quarantine status', async () => {
    const response = await upload({
      filename: 'nefes-temelleri.txt',
      stage: 'GENERAL',
      content:
        'Nefes meditasyonunda dikkat nazikçe nefese geri getirilir. İlk pratik 15 dakikadır.',
    });
    expect(response.statusCode).toBe(201);
    [introduction] = response.json() as UploadedVersion[];
    expect(introduction.status).toBe('UPLOADED');
    const stored = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({
      where: { id: introduction.id },
      include: { stageAssignments: true },
    });
    expect(stored.stageAssignments.map(({ stage }) => stage)).toEqual(['GENERAL']);
  });

  it('automatically parses, chunks, embeds and publishes uploaded content', async () => {
    expect(await processor.process(introduction.id)).toBe('processed');
    const stored = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({
      where: { id: introduction.id },
      include: { chunks: true },
    });
    expect(stored.status).toBe('PUBLISHED');
    expect(stored.publishedAt).toEqual(clock.now());
    expect(stored.extractedText).toContain('İlk pratik 15 dakikadır');
    expect(stored.chunks.length).toBeGreaterThan(0);
    expect(
      await prisma.knowledgeEmbedding.count({
        where: { chunk: { documentVersionId: introduction.id } },
      }),
    ).toBeGreaterThan(0);
  });

  it('returns extracted content and chunks in the detail endpoint', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/knowledge/versions/${introduction.id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'PUBLISHED', filename: 'nefes-temelleri.txt' });
    expect(response.json().extractedText).toContain('Nefes meditasyonunda');
    expect(response.json().chunks.length).toBeGreaterThan(0);
  });

  it('uploads and publishes Intermediate content with the correct assignment', async () => {
    const response = await upload({
      filename: 'beden-taramasi.txt',
      stage: 'INTERMEDIATE',
      content: 'Beden taraması pratiğinde bedensel duyumlar yargılamadan ve merakla izlenir.',
    });
    [intermediate] = response.json() as UploadedVersion[];
    expect(await processor.process(intermediate.id)).toBe('processed');
    const stored = await prisma.knowledgeDocumentVersion.findUniqueOrThrow({
      where: { id: intermediate.id },
      include: { stageAssignments: true },
    });
    expect(stored.status).toBe('PUBLISHED');
    expect(stored.stageAssignments[0]?.stage).toBe('INTERMEDIATE');
  });

  it('uploads and publishes Advanced content with the correct assignment', async () => {
    const response = await upload({
      filename: 'acik-farkindalik.txt',
      stage: 'ADVANCED',
      content:
        'Açık farkındalık pratiği deneyimin değişen doğasını çabasız bir dikkatle gözlemler.',
    });
    [advanced] = response.json() as UploadedVersion[];
    expect(await processor.process(advanced.id)).toBe('processed');
    const assignment = await prisma.knowledgeDocumentStageAssignment.findFirstOrThrow({
      where: { documentVersionId: advanced.id },
    });
    expect(assignment.stage).toBe('ADVANCED');
  });

  it('lists all three levels and their latest document versions', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/admin/knowledge/bases/${baseId}/documents`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(3);
    const stages = response
      .json()
      .flatMap((document: { versions: Array<{ stageAssignments: Array<{ stage: string }> }> }) =>
        document.versions[0].stageAssignments.map(({ stage }) => stage),
      );
    expect(stages).toEqual(expect.arrayContaining(['GENERAL', 'INTERMEDIATE', 'ADVANCED']));
  });

  it('searches only published knowledge and supports a level filter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/knowledge/search?q=bedensel&stage=INTERMEDIATE',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().results).toEqual(
      expect.arrayContaining([expect.objectContaining({ logical_name: 'beden-taramasi.txt' })]),
    );
    expect(response.json().results).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ logical_name: 'acik-farkindalik.txt' })]),
    );
  });

  it('publishes a replacement version and archives the previous published version', async () => {
    const response = await upload({
      filename: 'nefes-temelleri-v2.txt',
      logicalName: 'nefes-temelleri.txt',
      stage: 'GENERAL',
      content: 'Güncellenen nefes pratiği açıklaması: başlangıç oturumu sakin ve nazik ilerler.',
    });
    const [replacement] = response.json() as UploadedVersion[];
    expect(await processor.process(replacement.id)).toBe('processed');
    const versions = await prisma.knowledgeDocumentVersion.findMany({
      where: { documentId: introduction.documentId },
      orderBy: { version: 'asc' },
    });
    expect(versions.map(({ status }) => status)).toEqual(['ARCHIVED', 'PUBLISHED']);
  });

  it('rejects unsupported stages before creating a document', async () => {
    const before = await prisma.knowledgeDocument.count({ where: { knowledgeBaseId: baseId } });
    const response = await upload({
      filename: 'hafta-bes.txt',
      stage: 'WEEK_5',
      content: 'Geçersiz seviye içeriği',
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.knowledgeDocument.count({ where: { knowledgeBaseId: baseId } })).toBe(
      before,
    );
  });
});
