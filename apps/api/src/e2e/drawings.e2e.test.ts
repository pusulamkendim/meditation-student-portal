import multipart from '@fastify/multipart';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
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
import { DrawingController, PublicDrawingController } from '../drawings/drawing.controller.js';
import {
  createDrawingStorage,
  DRAWING_STORAGE,
  DrawingService,
} from '../drawings/drawing.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

const runE2e = process.env.RUN_DRAWING_E2E === 'true';

function multipartBody(filename: string, content: string) {
  const boundary = `----drawing-e2e-${randomUUID()}`;
  return {
    boundary,
    payload: Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--\r\n`,
    ),
  };
}

describe.runIf(runE2e)('E2E-DRAWINGS drawing library', () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const lookupKey = randomBytes(48).toString('base64');
  const encryptionKey = randomBytes(32).toString('base64');
  const orchestrator = {
    createIntent: vi.fn(async (input: { eventKey: SystemEventKey }) => ({
      occurrenceId: randomUUID(),
      intentId: (
        await prisma.messageIntent.create({
          data: {
            studentId,
            channelIdentityId,
            category: input.eventKey,
            idempotencyKey: `drawing-e2e:${randomUUID()}`,
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
  let drawingId: string;
  let drawingVersion: number;
  let studentId: string;
  let channelAccountId: string;
  let channelIdentityId: string;
  let assignmentId: string;
  let accessToken: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'meditation-drawings-e2e-'));
    process.env.KNOWLEDGE_LOCAL_STORAGE_DIR = storageRoot;
    const config = loadApplicationConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      ADMIN_ORIGIN: 'http://localhost:3001',
      DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: encryptionKey }),
      ACTIVE_DATA_KEY_ID: 'test',
      LOOKUP_HMAC_KEY: lookupKey,
      R2_PRIVATE_BUCKET: 'e2e-drawings',
    }) as ApplicationConfig;
    prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    adminId = (await prisma.adminUser.findFirstOrThrow({ select: { id: true } })).id;
    channelAccountId = (
      await prisma.channelAccount.create({
        data: {
          type: 'TELEGRAM',
          displayName: 'Drawing E2E',
          externalId: `drawing-e2e-${randomUUID()}`,
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
      controllers: [DrawingController, PublicDrawingController],
      providers: [
        DrawingService,
        PrismaService,
        { provide: APPLICATION_CONFIG, useValue: config },
        { provide: SystemMessageOrchestrator, useValue: orchestrator },
        {
          provide: DRAWING_STORAGE,
          useValue: createDrawingStorage(config),
        },
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
    await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, parts: 2 } });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (drawingId) {
      await prisma.drawing.deleteMany({ where: { id: drawingId } });
      await prisma.auditLog.deleteMany({ where: { entityType: 'Drawing', entityId: drawingId } });
    }
    if (assignmentId)
      await prisma.auditLog.deleteMany({
        where: { entityType: 'Drawing', entityId: assignmentId },
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

  it('creates, lists and opens a blank drawing', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/drawings',
      payload: { title: 'E2E Nefes Çizimi', description: 'Geçici çizim' },
    });

    expect(created.statusCode).toBe(201);
    drawingId = created.json().id as string;
    drawingVersion = created.json().version as number;

    const listed = await app.inject({ method: 'GET', url: '/v1/admin/drawings' });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: drawingId, elementCount: 0 })]),
    );

    const detail = await app.inject({ method: 'GET', url: `/v1/admin/drawings/${drawingId}` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().scene).toMatchObject({ type: 'excalidraw', version: 2, elements: [] });
  });

  it('persists scene changes and rejects a stale save', async () => {
    const scene = {
      type: 'excalidraw',
      version: 2,
      source: 'drawing-e2e',
      elements: [{ id: 'shape-1', type: 'rectangle', x: 40, y: 60 }],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };
    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/drawings/${drawingId}`,
      payload: {
        expectedVersion: drawingVersion,
        title: 'E2E Güncel Çizim',
        scene,
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ version: drawingVersion + 1, elementCount: 1 });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/drawings/${drawingId}`,
      payload: { expectedVersion: drawingVersion, title: 'Eski kayıt' },
    });
    expect(stale.statusCode).toBe(409);
    drawingVersion += 1;
  });

  it('uploads a valid .excalidraw file and rejects malformed content', async () => {
    const valid = multipartBody(
      'Yüklenen Çizim.excalidraw',
      JSON.stringify({
        type: 'excalidraw',
        version: 2,
        elements: [],
        appState: {},
        files: {},
      }),
    );
    const uploaded = await app.inject({
      method: 'POST',
      url: '/v1/admin/drawings/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${valid.boundary}` },
      payload: valid.payload,
    });
    expect(uploaded.statusCode).toBe(201);
    expect(uploaded.json().title).toBe('Yüklenen Çizim');

    const uploadedId = uploaded.json().id as string;
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/drawings/${uploadedId}`,
    });
    expect(deleted.statusCode).toBe(200);
    await prisma.auditLog.deleteMany({ where: { entityType: 'Drawing', entityId: uploadedId } });

    const invalid = multipartBody('bozuk.excalidraw', '{broken');
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/admin/drawings/upload',
      headers: { 'content-type': `multipart/form-data; boundary=${invalid.boundary}` },
      payload: invalid.payload,
    });
    expect(rejected.statusCode).toBe(400);
  });

  it('shares a personal read-only link, serves the latest version and revokes access', async () => {
    const shared = await app.inject({
      method: 'POST',
      url: `/v1/admin/drawings/${drawingId}/assignments`,
      payload: { studentIds: [studentId] },
    });
    expect(shared.statusCode).toBe(201);
    expect(shared.json().items[0]).toMatchObject({ sent: true, studentId });
    assignmentId = shared.json().items[0].assignmentId as string;
    accessToken = new URL(shared.json().items[0].drawingUrl as string).hash.slice(1);
    expect(orchestrator.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'DRAWING_SHARED' }),
    );

    const opened = await app.inject({
      method: 'POST',
      url: '/v1/drawings/access',
      payload: { token: accessToken },
    });
    expect(opened.statusCode).toBe(201);
    expect(opened.json()).toMatchObject({
      title: 'E2E Güncel Çizim',
      updatedSinceShare: false,
    });
    expect(opened.json().scene.elements).toHaveLength(1);

    const current = await prisma.drawing.findUniqueOrThrow({ where: { id: drawingId } });
    const updated = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/drawings/${drawingId}`,
      payload: {
        expectedVersion: current.version,
        title: 'E2E Paylaşılmış Çizim',
      },
    });
    expect(updated.statusCode).toBe(200);

    const reopened = await app.inject({
      method: 'POST',
      url: '/v1/drawings/access',
      payload: { token: accessToken },
    });
    expect(reopened.statusCode).toBe(201);
    expect(reopened.json()).toMatchObject({
      title: 'E2E Paylaşılmış Çizim',
      updatedSinceShare: true,
    });

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/drawings/${drawingId}/assignments/${assignmentId}`,
    });
    expect(revoked.statusCode).toBe(200);
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/drawings/access',
      payload: { token: accessToken },
    });
    expect(rejected.statusCode).toBe(404);
  });

  it('protects a shared drawing from permanent deletion and allows archiving', async () => {
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/admin/drawings/${drawingId}`,
    });
    expect(deleted.statusCode).toBe(409);
    expect(await prisma.drawing.count({ where: { id: drawingId } })).toBe(1);

    const drawing = await prisma.drawing.findUniqueOrThrow({ where: { id: drawingId } });
    const archived = await app.inject({
      method: 'PATCH',
      url: `/v1/admin/drawings/${drawingId}`,
      payload: { expectedVersion: drawing.version, status: 'ARCHIVED' },
    });
    expect(archived.statusCode).toBe(200);

    const reshared = await app.inject({
      method: 'POST',
      url: `/v1/admin/drawings/${drawingId}/assignments`,
      payload: { studentIds: [studentId] },
    });
    expect(reshared.statusCode).toBe(400);
  });
});
