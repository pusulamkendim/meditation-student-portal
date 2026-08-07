import { randomBytes } from 'node:crypto';

import { FakeClock, FieldEncryption, type ApplicationConfig } from '@meditation/core';
import {
  StudentReportAiStatus,
  StudentReportStatus,
  StudentReportType,
} from '@meditation/database';
import { describe, expect, it, vi } from 'vitest';

import {
  isEligibleReportSession,
  maxCompletedDayStreak,
  outcomeCounts,
  StudentReportService,
  type StudentReportContent,
} from './student-report.service.js';

describe('student report facts', () => {
  it('counts completed, explicit skips, missing replies and pending replies separately', () => {
    expect(
      outcomeCounts([
        { status: 'COMPLETED', reflection: { id: 'reflection-1' } },
        { status: 'COMPLETED', reflection: null },
        { status: 'SKIPPED', reflection: null },
        { status: 'MISSED', reflection: null },
        { status: 'AWAITING_RESPONSE', reflection: null },
      ]),
    ).toEqual({
      planned: 5,
      completed: 2,
      skipped: 1,
      missed: 1,
      awaitingResponse: 1,
      reflections: 1,
    });
  });

  it('excludes cancelled, suppressed and future sessions from an approved report snapshot', () => {
    const now = new Date('2026-08-07T12:00:00.000Z');
    expect(
      isEligibleReportSession(
        { status: 'COMPLETED', startAt: new Date('2026-08-07T08:00:00.000Z') },
        now,
      ),
    ).toBe(true);
    expect(
      isEligibleReportSession(
        { status: 'CANCELLED', startAt: new Date('2026-08-07T08:00:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleReportSession(
        { status: 'SUPPRESSED', startAt: new Date('2026-08-07T08:00:00.000Z') },
        now,
      ),
    ).toBe(false);
    expect(
      isEligibleReportSession(
        { status: 'SCHEDULED', startAt: new Date('2026-08-07T18:00:00.000Z') },
        now,
      ),
    ).toBe(false);
  });

  it('uses day-level continuity when morning and evening sessions coexist', () => {
    expect(
      maxCompletedDayStreak([
        { sessions: [{ status: 'COMPLETED' }, { status: 'MISSED' }] },
        { sessions: [{ status: 'COMPLETED' }] },
        { sessions: [{ status: 'SKIPPED' }] },
        { sessions: [{ status: 'COMPLETED' }] },
      ]),
    ).toBe(2);
  });
});

describe('StudentReportService approval', () => {
  it('re-encrypts content for the incremented optimistic-lock version', async () => {
    const key = randomBytes(32);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const reportId = '00000000-0000-4000-8000-000000000010';
    const content: StudentReportContent = {
      subtitle: 'Düzenli bir hafta.',
      featuredReflectionId: null,
      gentleObservation: { text: 'Nazik gözlem', evidenceRefs: ['practice:summary'] },
      supportPoint: { text: 'Destek noktası', evidenceRefs: ['practice:summary'] },
      weeklyEvaluation: { text: 'Dönem değerlendirmesi', evidenceRefs: ['practice:summary'] },
      internal: { confidence: 1, insufficientEvidence: false, safetyConcern: false },
    };
    const original = encryption.encrypt(JSON.stringify(content), `student-report:${reportId}:v1`);
    const row = {
      id: reportId,
      studentId: '00000000-0000-4000-8000-000000000020',
      type: StudentReportType.WEEKLY,
      periodStart: new Date('2026-07-31T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-08-07T00:00:00.000Z'),
      status: StudentReportStatus.DRAFT,
      aiStatus: StudentReportAiStatus.READY,
      snapshot: {},
      contentEncrypted: new Uint8Array(original.ciphertext),
      contentKeyId: original.keyId,
      featuredReflectionId: null,
      inputHash: 'input-hash',
      modelRef: null,
      operationId: null,
      promptVersionId: null,
      version: 1,
      createdByAdminId: '00000000-0000-4000-8000-000000000030',
      approvedByAdminId: null,
      approvedAt: null,
      publishedAt: null,
      createdAt: new Date('2026-08-07T07:00:00.000Z'),
      updatedAt: new Date('2026-08-07T07:00:00.000Z'),
      share: null,
    };
    let updateData: Record<string, unknown> | undefined;
    const tx = {
      studentReportCard: {
        updateMany: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          updateData = data;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn().mockImplementation(() => ({
          ...row,
          status: StudentReportStatus.APPROVED,
          version: 2,
          approvedAt: new Date('2026-08-07T08:00:00.000Z'),
          contentEncrypted: updateData?.contentEncrypted,
          contentKeyId: updateData?.contentKeyId,
        })),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      studentReportCard: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new StudentReportService(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
        LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
        STUDENT_REPORT_PUBLIC_ORIGIN: 'https://sakinizihin.com',
      } as ApplicationConfig,
      new FakeClock('2026-08-07T08:00:00.000Z'),
      { createIntent: vi.fn() } as never,
    );

    await expect(service.approve(reportId, 'admin-1', 1, false)).resolves.toMatchObject({
      status: StudentReportStatus.APPROVED,
      version: 2,
      content,
    });
    expect(
      JSON.parse(
        encryption.decrypt(
          {
            ciphertext: Buffer.from(updateData?.contentEncrypted as Uint8Array),
            keyId: updateData?.contentKeyId as string,
          },
          `student-report:${reportId}:v2`,
        ),
      ),
    ).toEqual(content);
  });

  it('queues the active report link on the student default channel', async () => {
    const key = randomBytes(32);
    const encryption = new FieldEncryption(new Map([['test', key]]), 'test');
    const reportId = '00000000-0000-4000-8000-000000000040';
    const studentId = '00000000-0000-4000-8000-000000000041';
    const shareId = '00000000-0000-4000-8000-000000000042';
    const channelId = '00000000-0000-4000-8000-000000000043';
    const token = 'report-token-with-more-than-thirty-two-characters';
    const tokenEncrypted = encryption.encrypt(token, `student-report-share:${reportId}:token`);
    const nameEncrypted = encryption.encrypt('Ayşe Yılmaz', `student:${studentId}:name`);
    const share = {
      id: shareId,
      reportId,
      tokenHmac: 'token-hmac',
      tokenEncrypted: new Uint8Array(tokenEncrypted.ciphertext),
      tokenKeyId: tokenEncrypted.keyId,
      status: 'ACTIVE',
      expiresAt: null,
      viewCount: 0,
      firstOpenedAt: null,
      lastOpenedAt: null,
      version: 2,
      messageIntentId: null,
      lastSentAt: null,
      sendCount: 0,
      createdByAdminId: 'admin-1',
      createdAt: new Date('2026-08-07T07:00:00.000Z'),
      updatedAt: new Date('2026-08-07T07:00:00.000Z'),
    };
    const row = {
      id: reportId,
      studentId,
      status: StudentReportStatus.PUBLISHED,
      periodStart: new Date('2026-07-31T00:00:00.000Z'),
      periodEndExclusive: new Date('2026-08-07T00:00:00.000Z'),
      share,
      student: {
        id: studentId,
        preferredLocale: 'tr-TR',
        curriculumStage: 'WEEK_2',
        fullNameEncrypted: new Uint8Array(nameEncrypted.ciphertext),
        fullNameKeyId: nameEncrypted.keyId,
        defaultChannelIdentity: {
          id: channelId,
          channelAccount: { type: 'WHATSAPP' },
        },
      },
    };
    const tx = {
      studentReportShare: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      studentReportCard: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const messages = {
      createIntent: vi
        .fn()
        .mockResolvedValue({ occurrenceId: 'occurrence-1', intentId: 'intent-1' }),
    };
    const service = new StudentReportService(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ test: key.toString('base64') }),
        ACTIVE_DATA_KEY_ID: 'test',
        LOOKUP_HMAC_KEY: randomBytes(32).toString('base64'),
        STUDENT_REPORT_PUBLIC_ORIGIN: 'https://sakinizihin.com',
      } as ApplicationConfig,
      new FakeClock('2026-08-07T08:00:00.000Z'),
      messages as never,
    );

    await expect(service.sendShare(reportId, 'admin-1')).resolves.toEqual({
      queued: true,
      messageIntentId: 'intent-1',
      reportUrl: `https://sakinizihin.com/karne/${token}`,
      channel: 'WHATSAPP',
    });
    expect(messages.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: 'STUDENT_REPORT_SHARED',
        studentId,
        channelIdentityId: channelId,
        variables: {
          studentDisplayName: ' Ayşe',
          periodText: '31 Temmuz 2026 – 6 Ağustos 2026',
          reportUrl: `https://sakinizihin.com/karne/${token}`,
        },
      }),
    );
    expect(tx.studentReportShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: shareId, version: 2 },
        data: expect.objectContaining({ messageIntentId: 'intent-1' }),
      }),
    );
  });
});
