import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  LookupHmac,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  ConsentScope,
  Prisma,
  StudentReportAiStatus,
  StudentReportStatus,
  StudentReportType,
} from '@meditation/database';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

const DAY_MS = 86_400_000;
const ELIGIBLE_STATUSES = new Set([
  'SCHEDULED',
  'REMINDED',
  'AWAITING_RESPONSE',
  'COMPLETED',
  'SKIPPED',
  'MISSED',
]);
const RESULT_STATUSES = new Set(['COMPLETED', 'SKIPPED', 'MISSED']);

export type StudentReportContent = {
  subtitle: string;
  featuredReflectionId: string | null;
  featuredReflectionQuote?: string;
  gentleObservation: { text: string; evidenceRefs: string[] };
  supportPoint: { text: string; evidenceRefs: string[] };
  weeklyEvaluation: { text: string; evidenceRefs: string[] };
  internal: {
    confidence: number;
    insufficientEvidence: boolean;
    safetyConcern: boolean;
  };
};

type ReportCreateInput = {
  type: StudentReportType;
  periodStart: Date;
  periodEndExclusive: Date;
};

type ReportEditInput = {
  version: number;
  subtitle: string;
  featuredReflectionId: string | null;
  gentleObservation: string;
  supportPoint: string;
  weeklyEvaluation: string;
};

@Injectable()
export class StudentReportService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(SystemMessageOrchestrator) private readonly messages: SystemMessageOrchestrator,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Student report encryption and lookup keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async list(studentId: string, adminId: string) {
    await this.requireStudent(studentId);
    const rows = await this.prisma.studentReportCard.findMany({
      where: { studentId },
      include: { share: true },
      orderBy: [{ periodEndExclusive: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    await this.audit(adminId, 'STUDENT_REPORT_LIST_READ', studentId, {});
    return { items: rows.map((row) => this.presentAdmin(row)) };
  }

  async detail(reportId: string, adminId: string) {
    const row = await this.reportRow(reportId);
    const reflections = await this.reflectionCandidates(
      row.studentId,
      row.periodStart,
      row.periodEndExclusive,
    );
    await this.audit(adminId, 'STUDENT_REPORT_READ', reportId, {});
    return { ...this.presentAdmin(row), reflectionCandidates: reflections };
  }

  async create(studentId: string, adminId: string, input: ReportCreateInput) {
    const student = await this.requireStudent(studentId);
    this.validatePeriod(input, student.timezone);
    const snapshot = await this.buildSnapshot(
      studentId,
      student.timezone,
      input.periodStart,
      input.periodEndExclusive,
    );
    const id = randomUUID();
    const content = initialContent(snapshot);
    const encrypted = this.encryptContent(id, 1, content);
    const inputHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.studentReportCard.create({
        data: {
          id,
          studentId,
          type: input.type,
          periodStart: input.periodStart,
          periodEndExclusive: input.periodEndExclusive,
          snapshot: snapshot as Prisma.InputJsonValue,
          contentEncrypted: new Uint8Array(encrypted.ciphertext),
          contentKeyId: encrypted.keyId,
          inputHash,
          createdByAdminId: adminId,
        },
        include: { share: true },
      });
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_CREATED', id, {
        studentId,
        type: input.type,
        periodStart: input.periodStart.toISOString().slice(0, 10),
        periodEndExclusive: input.periodEndExclusive.toISOString().slice(0, 10),
      });
      return created;
    });
    return this.presentAdmin(row);
  }

  async edit(reportId: string, adminId: string, input: ReportEditInput) {
    const row = await this.reportRow(reportId);
    if (row.status !== StudentReportStatus.DRAFT)
      throw new ConflictException('Yalnızca taslak karne düzenlenebilir.');
    if (row.version !== input.version)
      throw new ConflictException(
        'Karne başka bir işlem tarafından güncellendi. Sayfayı yenileyin.',
      );
    const current = this.decryptContent(row);
    const featured = input.featuredReflectionId
      ? await this.requireReflection(
          row.studentId,
          input.featuredReflectionId,
          row.periodStart,
          row.periodEndExclusive,
        )
      : undefined;
    const next: StudentReportContent = {
      ...current,
      subtitle: input.subtitle.trim(),
      featuredReflectionId: featured?.id ?? null,
      featuredReflectionQuote: featured?.text,
      gentleObservation: { ...current.gentleObservation, text: input.gentleObservation.trim() },
      supportPoint: { ...current.supportPoint, text: input.supportPoint.trim() },
      weeklyEvaluation: { ...current.weeklyEvaluation, text: input.weeklyEvaluation.trim() },
    };
    const nextVersion = row.version + 1;
    const encrypted = this.encryptContent(row.id, nextVersion, next);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.studentReportCard.updateMany({
        where: { id: reportId, version: input.version, status: StudentReportStatus.DRAFT },
        data: {
          contentEncrypted: new Uint8Array(encrypted.ciphertext),
          contentKeyId: encrypted.keyId,
          featuredReflectionId: featured?.id ?? null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException('Karne güncellenemedi. Sayfayı yenileyin.');
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_EDITED', reportId, {
        version: nextVersion,
      });
      return tx.studentReportCard.findUniqueOrThrow({
        where: { id: reportId },
        include: { share: true },
      });
    });
    return this.presentAdmin(updated);
  }

  async requestAi(reportId: string, adminId: string) {
    const row = await this.reportRow(reportId);
    if (row.status !== StudentReportStatus.DRAFT)
      throw new ConflictException('Yalnızca taslak karne için AI metni üretilebilir.');
    if (row.aiStatus === StudentReportAiStatus.PENDING)
      return { id: row.id, aiStatus: StudentReportAiStatus.PENDING };
    await this.requireAiConsent(row.studentId);
    const operationId = `student-report:${row.id}:v${row.version}:${randomUUID()}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.studentReportCard.update({
        where: { id: row.id },
        data: { aiStatus: StudentReportAiStatus.PENDING, operationId },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'llm.student-report',
          aggregateType: 'StudentReportCard',
          aggregateId: row.id,
          eventType: 'StudentReportAiRequested',
          payload: { reportId: row.id, operationId },
        },
      });
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_AI_REQUESTED', row.id, {});
    });
    return { id: row.id, aiStatus: StudentReportAiStatus.PENDING };
  }

  async approve(reportId: string, adminId: string, version: number, acknowledgeSafety: boolean) {
    const row = await this.reportRow(reportId);
    if (row.status !== StudentReportStatus.DRAFT)
      throw new ConflictException('Yalnızca taslak karne onaylanabilir.');
    if (row.version !== version) throw new ConflictException('Karne sürümü güncel değil.');
    const content = this.decryptContent(row);
    if (content.internal.safetyConcern && !acknowledgeSafety)
      throw new BadRequestException('Güvenlik uyarısını inceleyip onaylamanız gerekiyor.');
    const now = this.clock.now();
    const nextVersion = row.version + 1;
    const encrypted = this.encryptContent(row.id, nextVersion, content);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.studentReportCard.updateMany({
        where: { id: reportId, version, status: StudentReportStatus.DRAFT },
        data: {
          status: StudentReportStatus.APPROVED,
          contentEncrypted: new Uint8Array(encrypted.ciphertext),
          contentKeyId: encrypted.keyId,
          approvedByAdminId: adminId,
          approvedAt: now,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ConflictException('Karne onaylanamadı. Sayfayı yenileyin.');
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_APPROVED', reportId, { version });
      return tx.studentReportCard.findUniqueOrThrow({
        where: { id: reportId },
        include: { share: true },
      });
    });
    return this.presentAdmin(updated);
  }

  async createShare(reportId: string, adminId: string, expiresAt: Date | null) {
    const row = await this.reportRow(reportId);
    if (row.status !== StudentReportStatus.APPROVED && row.status !== StudentReportStatus.PUBLISHED)
      throw new ConflictException('Paylaşım bağlantısı için karne önce onaylanmalıdır.');
    if (expiresAt && expiresAt <= this.clock.now())
      throw new BadRequestException('Bağlantı son kullanma tarihi gelecekte olmalıdır.');
    const token = randomBytes(32).toString('base64url');
    const tokenHmac = this.lookup.digest(`student-report:${token}`);
    const encryptedToken = this.encryption.encrypt(token, `student-report-share:${row.id}:token`);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      await tx.studentReportShare.upsert({
        where: { reportId },
        create: {
          reportId,
          tokenHmac,
          tokenEncrypted: new Uint8Array(encryptedToken.ciphertext),
          tokenKeyId: encryptedToken.keyId,
          expiresAt,
          createdByAdminId: adminId,
        },
        update: {
          tokenHmac,
          tokenEncrypted: new Uint8Array(encryptedToken.ciphertext),
          tokenKeyId: encryptedToken.keyId,
          status: 'ACTIVE',
          expiresAt,
          messageIntentId: null,
          lastSentAt: null,
          sendCount: 0,
          version: { increment: 1 },
        },
      });
      await tx.studentReportCard.update({
        where: { id: reportId },
        data: { status: StudentReportStatus.PUBLISHED, publishedAt: row.publishedAt ?? now },
      });
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_SHARE_CREATED', reportId, { expiresAt });
    });
    return { publicUrl: this.publicUrl(token), tokenCreatedAt: now.toISOString() };
  }

  async sendShare(reportId: string, adminId: string) {
    const row = await this.prisma.studentReportCard.findUnique({
      where: { id: reportId },
      include: {
        share: true,
        student: {
          include: { defaultChannelIdentity: { include: { channelAccount: true } } },
        },
      },
    });
    if (!row) throw new NotFoundException('Karne bulunamadı.');
    if (row.status !== StudentReportStatus.PUBLISHED)
      throw new ConflictException('Öğrenciyle paylaşmak için önce aktif bir bağlantı oluşturun.');
    if (
      !row.share ||
      row.share.status !== 'ACTIVE' ||
      (row.share.expiresAt && row.share.expiresAt <= this.clock.now())
    )
      throw new ConflictException('Aktif karne bağlantısı bulunamadı.');
    if (!row.share.tokenEncrypted || !row.share.tokenKeyId)
      throw new ConflictException(
        'Bu bağlantı gönderime uygun değil. Bağlantıyı yeniden oluşturun.',
      );
    if (!row.student.defaultChannelIdentity)
      throw new BadRequestException('Öğrencinin varsayılan mesaj kanalı bulunmuyor.');

    const token = this.encryption.decrypt(
      {
        ciphertext: Buffer.from(row.share.tokenEncrypted),
        keyId: row.share.tokenKeyId,
      },
      `student-report-share:${row.id}:token`,
    );
    const reportUrl = this.publicUrl(token);
    const attempt = row.share.sendCount + 1;
    const result = await this.messages.createIntent({
      eventKey: 'STUDENT_REPORT_SHARED',
      studentId: row.studentId,
      channelIdentityId: row.student.defaultChannelIdentity.id,
      idempotencyKey: `student-report:${row.id}:shared:v${row.share.version}:n${attempt}`,
      locale: row.student.preferredLocale,
      stage: row.student.curriculumStage,
      variables: {
        studentDisplayName: this.firstNameVariable(row.student),
        periodText: this.formatPeriod(row.periodStart, row.periodEndExclusive),
        reportUrl,
      },
    });
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.studentReportShare.updateMany({
        where: { id: row.share!.id, version: row.share!.version },
        data: {
          messageIntentId: result.intentId,
          lastSentAt: now,
          sendCount: { increment: 1 },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) return;
      await this.auditWith(tx, adminId, 'STUDENT_REPORT_SHARED', reportId, {
        channel: row.student.defaultChannelIdentity!.channelAccount.type,
        messageIntentId: result.intentId,
      });
    });
    return {
      queued: true,
      messageIntentId: result.intentId,
      reportUrl,
      channel: row.student.defaultChannelIdentity.channelAccount.type,
    };
  }

  async revokeShare(reportId: string, adminId: string) {
    const result = await this.prisma.studentReportShare.updateMany({
      where: { reportId, status: 'ACTIVE' },
      data: { status: 'REVOKED', version: { increment: 1 } },
    });
    if (!result.count) throw new NotFoundException('Aktif karne bağlantısı bulunamadı.');
    await this.audit(adminId, 'STUDENT_REPORT_SHARE_REVOKED', reportId, {});
    return { revoked: true };
  }

  async publicReport(token: string) {
    if (token.length < 32 || token.length > 100)
      throw new NotFoundException('Karne bağlantısı geçersiz.');
    const share = await this.prisma.studentReportShare.findUnique({
      where: { tokenHmac: this.lookup.digest(`student-report:${token}`) },
      include: { report: { include: { student: true } } },
    });
    const now = this.clock.now();
    if (
      !share ||
      share.status !== 'ACTIVE' ||
      share.report.status !== StudentReportStatus.PUBLISHED ||
      (share.expiresAt && share.expiresAt <= now)
    )
      throw new NotFoundException('Karne bağlantısı geçersiz veya kullanıma kapalı.');
    await this.prisma.studentReportShare.update({
      where: { id: share.id },
      data: {
        viewCount: { increment: 1 },
        firstOpenedAt: share.firstOpenedAt ?? now,
        lastOpenedAt: now,
      },
    });
    const content = this.decryptContent(share.report);
    return {
      type: share.report.type,
      periodStart: share.report.periodStart.toISOString().slice(0, 10),
      periodEndExclusive: share.report.periodEndExclusive.toISOString().slice(0, 10),
      studentFirstName: this.decryptName(share.report.student).split(/\s+/u)[0] ?? 'Öğrenci',
      snapshot: share.report.snapshot,
      content: {
        subtitle: content.subtitle,
        featuredReflectionQuote: content.featuredReflectionQuote,
        gentleObservation: content.gentleObservation.text,
        supportPoint: content.supportPoint.text,
        weeklyEvaluation: content.weeklyEvaluation.text,
      },
      publishedAt: share.report.publishedAt?.toISOString(),
    };
  }

  private async buildSnapshot(studentId: string, timezone: string, start: Date, end: Date) {
    const durationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    const previousStart = new Date(start.getTime() - durationDays * DAY_MS);
    const [sessions, subscriptions, meetings, pulse] = await Promise.all([
      this.prisma.practiceSession.findMany({
        where: {
          studentId,
          serviceDate: { gte: previousStart, lt: end },
          status: { notIn: ['CANCELLED', 'SUPPRESSED'] },
        },
        include: {
          practiceSlot: { select: { slotKey: true } },
          meditationType: { select: { id: true, title: true } },
          reflection: { select: { id: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
      this.prisma.subscriptionPeriod.findMany({
        where: { studentId, startDate: { lt: end }, endExclusive: { gt: start } },
        orderBy: { startDate: 'desc' },
        take: 1,
      }),
      this.prisma.weeklyMeeting.findMany({
        where: {
          meetingSeries: { studentId },
          startsAt: {
            gte: new Date(start.getTime() - DAY_MS),
            lt: new Date(end.getTime() + DAY_MS),
          },
        },
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.studentPulseInsight.findFirst({
        where: { studentId, periodStart: start, periodEndExclusive: end },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const now = this.clock.now();
    const eligible = sessions.filter((session) => isEligibleReportSession(session, now));
    const current = eligible.filter((session) => session.serviceDate >= start);
    const previous = eligible.filter((session) => session.serviceDate < start);
    const days = Array.from({ length: durationDays }, (_, index) => {
      const date = new Date(start.getTime() + index * DAY_MS);
      const dateKey = date.toISOString().slice(0, 10);
      return {
        date: dateKey,
        sessions: current
          .filter((session) => session.serviceDate.toISOString().slice(0, 10) === dateKey)
          .map((session) => ({
            id: session.id,
            slot: session.practiceSlot?.slotKey ?? 'CUSTOM',
            status: session.status,
            durationMinutes: session.durationMinutes,
            meditationType: session.meditationType?.title ?? null,
            reflectionId: session.reflection?.id ?? null,
          })),
      };
    });
    const currentCounts = outcomeCounts(current);
    const previousCounts = outcomeCounts(previous);
    const completionRate = rate(currentCounts.completed, currentCounts.planned);
    const previousCompletionRate = rate(previousCounts.completed, previousCounts.planned);
    const localMeetings = meetings
      .filter((meeting) => {
        const date = localDateKey(meeting.startsAt, timezone);
        return date >= start.toISOString().slice(0, 10) && date < end.toISOString().slice(0, 10);
      })
      .map((meeting) => ({
        id: meeting.id,
        startsAt: meeting.startsAt.toISOString(),
        status: meeting.status,
      }));
    const subscription = subscriptions[0];
    const periodLastDay = new Date(end.getTime() - DAY_MS);
    const packageWeek = subscription
      ? Math.max(
          1,
          Math.floor((periodLastDay.getTime() - subscription.startDate.getTime()) / (7 * DAY_MS)) +
            1,
        )
      : null;
    return {
      schemaVersion: 'student-report-snapshot-v1',
      timezone,
      generatedAt: now.toISOString(),
      period: {
        start: start.toISOString().slice(0, 10),
        endExclusive: end.toISOString().slice(0, 10),
        durationDays,
      },
      practice: {
        current: {
          ...currentCounts,
          completionRate,
          reflectionRate: rate(currentCounts.reflections, currentCounts.completed),
        },
        previous: { ...previousCounts, completionRate: previousCompletionRate },
        completionRateChange: completionRate - previousCompletionRate,
        maxCompletedDayStreak: maxCompletedDayStreak(days),
        days,
        slotPatterns: slotPatterns(current),
      },
      subscription: subscription
        ? {
            id: subscription.id,
            startDate: subscription.startDate.toISOString().slice(0, 10),
            endExclusive: subscription.endExclusive.toISOString().slice(0, 10),
            status: subscription.status,
            packageWeek,
          }
        : null,
      meetings: localMeetings,
      pulse: pulse
        ? {
            id: pulse.id,
            tone: pulse.tone,
            confidence: pulse.confidence,
            suggestedAction: pulse.suggestedAction,
            safetyConcern: pulse.safetyConcern,
          }
        : null,
      evidenceIds: [
        'practice:summary',
        'practice:comparison',
        ...days.flatMap((day) => day.sessions.map((session) => `practice:${session.id}`)),
        ...localMeetings.map((meeting) => `meeting:${meeting.id}`),
      ],
    };
  }

  private validatePeriod(input: ReportCreateInput, timezone: string) {
    const days = (input.periodEndExclusive.getTime() - input.periodStart.getTime()) / DAY_MS;
    if (!Number.isInteger(days) || days < 1)
      throw new BadRequestException('Karne bitiş tarihi başlangıç tarihinden sonra olmalıdır.');
    const maximum = input.type === StudentReportType.WEEKLY ? 14 : 35;
    if (days > maximum)
      throw new BadRequestException(`Bu karne için en fazla ${maximum} gün seçilebilir.`);
    if (input.periodEndExclusive > serviceDate(this.clock.now(), timezone))
      throw new BadRequestException('Karne yalnızca tamamlanmış günlerden oluşturulabilir.');
  }

  private async reflectionCandidates(studentId: string, start: Date, end: Date) {
    const rows = await this.prisma.practiceReflection.findMany({
      where: {
        contentEncrypted: { not: null },
        contentKeyId: { not: null },
        practiceSession: { studentId, serviceDate: { gte: start, lt: end } },
      },
      include: {
        practiceSession: {
          select: {
            id: true,
            serviceDate: true,
            practiceSlot: { select: { slotKey: true } },
            meditationType: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 14,
    });
    return rows.flatMap((row) =>
      row.contentEncrypted && row.contentKeyId
        ? [
            {
              id: row.id,
              sessionId: row.practiceSession.id,
              date: row.practiceSession.serviceDate.toISOString().slice(0, 10),
              slot: row.practiceSession.practiceSlot?.slotKey ?? 'CUSTOM',
              meditationType: row.practiceSession.meditationType?.title ?? null,
              text: this.encryption.decrypt(
                { ciphertext: Buffer.from(row.contentEncrypted), keyId: row.contentKeyId },
                `practice:${row.practiceSession.id}:reflection`,
              ),
            },
          ]
        : [],
    );
  }

  private async requireReflection(studentId: string, reflectionId: string, start: Date, end: Date) {
    const rows = await this.reflectionCandidates(studentId, start, end);
    const reflection = rows.find((item) => item.id === reflectionId);
    if (!reflection)
      throw new BadRequestException('Seçilen refleksiyon karne döneminde bulunmuyor.');
    return reflection;
  }

  private async requireAiConsent(studentId: string) {
    const rows = await this.prisma.consent.findMany({
      where: {
        studentId,
        scope: {
          in: [
            ConsentScope.AGENT_REPLY_AI,
            ConsentScope.REFLECTION_AI,
            ConsentScope.REFLECTION_STORAGE,
          ],
        },
      },
      orderBy: { occurredAt: 'desc' },
    });
    const latest = new Map<string, string>();
    for (const row of rows) if (!latest.has(row.scope)) latest.set(row.scope, row.status);
    const ai =
      latest.get(ConsentScope.AGENT_REPLY_AI) === 'GRANTED' ||
      latest.get(ConsentScope.REFLECTION_AI) === 'GRANTED';
    if (!ai || latest.get(ConsentScope.REFLECTION_STORAGE) !== 'GRANTED')
      throw new BadRequestException('Öğrencinin AI ve refleksiyon işleme izni bulunmuyor.');
  }

  private async requireStudent(studentId: string) {
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Öğrenci bulunamadı.');
    return student;
  }

  private async reportRow(reportId: string) {
    const row = await this.prisma.studentReportCard.findUnique({
      where: { id: reportId },
      include: { share: true },
    });
    if (!row) throw new NotFoundException('Karne bulunamadı.');
    return row;
  }

  private encryptContent(id: string, version: number, content: StudentReportContent) {
    return this.encryption.encrypt(JSON.stringify(content), `student-report:${id}:v${version}`);
  }

  private decryptContent(row: {
    id: string;
    version: number;
    contentEncrypted: Uint8Array;
    contentKeyId: string;
  }) {
    return JSON.parse(
      this.encryption.decrypt(
        { ciphertext: Buffer.from(row.contentEncrypted), keyId: row.contentKeyId },
        `student-report:${row.id}:v${row.version}`,
      ),
    ) as StudentReportContent;
  }

  private decryptName(student: {
    id: string;
    fullNameEncrypted: Uint8Array | null;
    fullNameKeyId: string | null;
  }) {
    if (!student.fullNameEncrypted || !student.fullNameKeyId) return 'Öğrenci';
    return this.encryption.decrypt(
      { ciphertext: Buffer.from(student.fullNameEncrypted), keyId: student.fullNameKeyId },
      `student:${student.id}:name`,
    );
  }

  private presentAdmin(row: Awaited<ReturnType<StudentReportService['reportRow']>>) {
    return {
      id: row.id,
      studentId: row.studentId,
      type: row.type,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEndExclusive: row.periodEndExclusive.toISOString().slice(0, 10),
      status: row.status,
      aiStatus: row.aiStatus,
      snapshot: row.snapshot,
      content: this.decryptContent(row),
      version: row.version,
      approvedAt: row.approvedAt?.toISOString(),
      publishedAt: row.publishedAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      share: row.share
        ? {
            status: row.share.status,
            expiresAt: row.share.expiresAt?.toISOString(),
            viewCount: row.share.viewCount,
            firstOpenedAt: row.share.firstOpenedAt?.toISOString(),
            lastOpenedAt: row.share.lastOpenedAt?.toISOString(),
            publicUrl: this.sharePublicUrl(row.id, row.share),
            messageIntentId: row.share.messageIntentId ?? undefined,
            lastSentAt: row.share.lastSentAt?.toISOString(),
            sendCount: row.share.sendCount,
          }
        : null,
    };
  }

  private publicUrl(token: string) {
    return `${this.config.STUDENT_REPORT_PUBLIC_ORIGIN.replace(/\/+$/u, '')}/karne/${token}`;
  }

  private sharePublicUrl(
    reportId: string,
    share: { status: string; tokenEncrypted: Uint8Array | null; tokenKeyId: string | null },
  ) {
    if (share.status !== 'ACTIVE' || !share.tokenEncrypted || !share.tokenKeyId) return undefined;
    try {
      return this.publicUrl(
        this.encryption.decrypt(
          { ciphertext: Buffer.from(share.tokenEncrypted), keyId: share.tokenKeyId },
          `student-report-share:${reportId}:token`,
        ),
      );
    } catch {
      return undefined;
    }
  }

  private firstNameVariable(student: {
    id: string;
    fullNameEncrypted: Uint8Array | null;
    fullNameKeyId: string | null;
  }) {
    const name = this.decryptName(student).trim();
    return name && name !== 'Öğrenci' ? ` ${name.split(/\s+/u)[0]}` : '';
  }

  private formatPeriod(start: Date, endExclusive: Date) {
    const end = new Date(endExclusive.getTime() - DAY_MS);
    const formatter = new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return `${formatter.format(start)} – ${formatter.format(end)}`;
  }

  private audit(
    adminId: string,
    action: string,
    entityId: string,
    safeDiff: Record<string, unknown>,
  ) {
    return this.auditWith(this.prisma, adminId, action, entityId, safeDiff);
  }

  private auditWith(
    tx: Prisma.TransactionClient | PrismaService,
    adminId: string,
    action: string,
    entityId: string,
    safeDiff: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        action,
        entityType: 'StudentReportCard',
        entityId,
        safeDiff: safeDiff as Prisma.InputJsonValue,
        reason: 'Student report action',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }
}

export function outcomeCounts(
  sessions: Array<{ status: string; reflection: { id: string } | null }>,
) {
  const planned = sessions.length;
  return {
    planned,
    completed: sessions.filter((item) => item.status === 'COMPLETED').length,
    skipped: sessions.filter((item) => item.status === 'SKIPPED').length,
    missed: sessions.filter((item) => item.status === 'MISSED').length,
    awaitingResponse: sessions.filter((item) => !RESULT_STATUSES.has(item.status)).length,
    reflections: sessions.filter((item) => item.reflection).length,
  };
}

function rate(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function slotPatterns(
  sessions: Array<{ status: string; practiceSlot: { slotKey: string } | null }>,
) {
  const keys = [...new Set(sessions.map((item) => item.practiceSlot?.slotKey ?? 'CUSTOM'))];
  return keys.map((slot) => {
    const rows = sessions.filter((item) => (item.practiceSlot?.slotKey ?? 'CUSTOM') === slot);
    return {
      slot,
      planned: rows.length,
      completed: rows.filter((item) => item.status === 'COMPLETED').length,
      completionRate: rate(rows.filter((item) => item.status === 'COMPLETED').length, rows.length),
    };
  });
}

export function maxCompletedDayStreak(days: Array<{ sessions: Array<{ status: string }> }>) {
  let maximum = 0;
  let current = 0;
  for (const day of days) {
    if (day.sessions.some((session) => session.status === 'COMPLETED')) {
      current += 1;
      maximum = Math.max(maximum, current);
    } else current = 0;
  }
  return maximum;
}

export function isEligibleReportSession(session: { status: string; startAt: Date }, now: Date) {
  return ELIGIBLE_STATUSES.has(session.status) && session.startAt < now;
}

function localDateKey(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function serviceDate(now: Date, timezone: string) {
  return new Date(`${localDateKey(now, timezone)}T00:00:00.000Z`);
}

function initialContent(snapshot: unknown): StudentReportContent {
  const facts = snapshot as {
    practice: { current: { planned: number; completed: number; skipped: number; missed: number } };
  };
  const current = facts.practice.current;
  return {
    subtitle: 'Bu dönemin pratik özeti.',
    featuredReflectionId: null,
    gentleObservation: {
      text: `Bu dönemde planlanan ${current.planned} pratikten ${current.completed} tanesi tamamlandı.`,
      evidenceRefs: ['practice:summary'],
    },
    supportPoint: {
      text:
        current.skipped + current.missed > 0
          ? 'Zorlandığın günlerde pratik düzenini birlikte sadeleştirebilir ve yeniden değerlendirebiliriz.'
          : 'Mevcut ritmini acele etmeden, sana iyi gelen biçimde sürdürebilirsin.',
      evidenceRefs: ['practice:summary'],
    },
    weeklyEvaluation: {
      text: `Bu dönemde ${current.completed} pratik tamamlandı. Kayıtların, pratiğin günlük yaşamındaki yerini birlikte değerlendirmek için somut bir başlangıç sunuyor.`,
      evidenceRefs: ['practice:summary'],
    },
    internal: { confidence: 1, insufficientEvidence: current.planned < 3, safetyConcern: false },
  };
}
