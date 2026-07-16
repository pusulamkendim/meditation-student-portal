import {
  getStudentContextInputSchema,
  LookupHmac,
  sha256,
  type ApplicationConfig,
  type Clock,
  type GetStudentContextInput,
  type StudentContextSection,
} from '@meditation/core';
import { Prisma, PrismaClient } from '@meditation/database';

type CursorPayload = {
  studentId: string;
  sections: StudentContextSection[];
  range: string;
  offset: number;
};

function iso(value: Date): string {
  return value.toISOString();
}

function recordHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

export class StudentContextReader {
  private readonly lookup: LookupHmac;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
    private readonly clock: Clock,
  ) {
    if (!config.LOOKUP_HMAC_KEY)
      throw new Error('LOOKUP_HMAC_KEY is required for context cursors.');
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async read(studentId: string, rawInput: GetStudentContextInput, sourceMessageId?: string) {
    const input = getStudentContextInputSchema.parse(rawInput);
    const startedAt = this.clock.now().getTime();
    const asOf = this.clock.now();
    const cursor = this.decodeCursor(input.cursor, studentId, input);
    const student = await this.prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const sections = [...new Set(input.sections)];
    const result: Record<string, unknown> = {};
    const hashes: string[] = [];
    let pageCount = 1;
    let nextCursor: string | null = null;

    for (const section of sections) {
      const page = await this.readSection(student, section, input, cursor?.offset ?? 0, asOf);
      result[section] = page.value;
      hashes.push(...page.hashes);
      if (page.nextOffset !== undefined) {
        pageCount = Math.max(pageCount, 2);
        nextCursor = this.encodeCursor({
          studentId,
          sections,
          range: input.range,
          offset: page.nextOffset,
        });
      }
    }

    await this.prisma.agentContextRead.create({
      data: {
        studentId,
        sourceMessageId,
        sections,
        range: input.range,
        asOf,
        projectionSchemaVersion: 'student-context-v1',
        recordHashes: hashes,
        rowCount: hashes.length,
        pageCount,
        latencyMs: this.clock.now().getTime() - startedAt,
        policyResult: 'ALLOW',
      },
    });
    return {
      schemaVersion: 'student-context-v1' as const,
      asOf: iso(asOf),
      range: input.range,
      sections: result,
      recordHashes: hashes,
      nextCursor,
    };
  }

  private async readSection(
    student: {
      id: string;
      timezone: string;
      preferredLocale: string;
      status: string;
      registrationStep: string;
      curriculumStage: string;
      curriculumStageSource: string;
      defaultChannelIdentityId: string | null;
    },
    section: StudentContextSection,
    input: GetStudentContextInput,
    offset: number,
    asOf: Date,
  ): Promise<{ value: unknown; hashes: string[]; nextOffset?: number }> {
    if (section === 'ACCOUNT') {
      const value = {
        status: student.status,
        registrationStep: student.registrationStep,
        timezone: student.timezone,
        preferredLocale: student.preferredLocale,
        curriculumStage: student.curriculumStage,
        curriculumStageSource: student.curriculumStageSource,
        hasDefaultChannel: Boolean(student.defaultChannelIdentityId),
      };
      return { value: { ...value, recordHash: recordHash(value) }, hashes: [recordHash(value)] };
    }

    if (section === 'MEMBERSHIP') {
      const periods = await this.prisma.subscriptionPeriod.findMany({
        where: {
          studentId: student.id,
          ...(input.range === 'CURRENT_PACKAGE'
            ? { OR: [{ status: 'ACTIVE' }, { status: 'SCHEDULED' }] }
            : {}),
        },
        orderBy: { startDate: 'desc' },
        take: input.pageSize,
        skip: input.range === 'ALL_PAGED' ? offset : 0,
      });
      const rows = periods.map((period) => ({
        status: period.status,
        startDate: period.startDate.toISOString().slice(0, 10),
        endExclusive: period.endExclusive.toISOString().slice(0, 10),
        priceMinor: period.priceMinor.toString(),
        currency: period.currency,
      }));
      const values = rows.map((row) => ({ ...row, recordHash: recordHash(row) }));
      const hasMore = input.range === 'ALL_PAGED' && periods.length === input.pageSize;
      return {
        value: values,
        hashes: values.map((row) => row.recordHash),
        nextOffset: hasMore ? offset + periods.length : undefined,
      };
    }

    if (section === 'PAYMENT') {
      const payments = await this.prisma.payment.findMany({
        where: { studentId: student.id },
        orderBy: { reportedAt: 'desc' },
        take: input.range === 'CURRENT_PACKAGE' ? 3 : input.pageSize,
        skip: input.range === 'ALL_PAGED' ? offset : 0,
      });
      const rows = payments.map((payment) => ({
        status: payment.status,
        amountMinor: payment.amountMinor.toString(),
        currency: payment.currency,
        reference: payment.referenceCode,
        reportedAt: iso(payment.reportedAt),
        approvedAt: payment.approvedAt ? iso(payment.approvedAt) : null,
      }));
      const values = rows.map((row) => ({ ...row, recordHash: recordHash(row) }));
      const hasMore = input.range === 'ALL_PAGED' && payments.length === input.pageSize;
      return {
        value: values,
        hashes: values.map((row) => row.recordHash),
        nextOffset: hasMore ? offset + payments.length : undefined,
      };
    }

    if (section === 'MEETINGS') {
      const meetings =
        input.range === 'CURRENT_PACKAGE'
          ? await Promise.all([
              this.prisma.weeklyMeeting.findMany({
                where: {
                  meetingSeries: { studentId: student.id },
                  startsAt: { lt: asOf },
                },
                orderBy: { startsAt: 'desc' },
                take: 2,
              }),
              this.prisma.weeklyMeeting.findMany({
                where: {
                  meetingSeries: { studentId: student.id },
                  startsAt: { gte: asOf },
                  status: 'SCHEDULED',
                },
                orderBy: { startsAt: 'asc' },
                take: 2,
              }),
            ]).then(([recent, upcoming]) => [...recent.reverse(), ...upcoming])
          : await this.prisma.weeklyMeeting.findMany({
              where: { meetingSeries: { studentId: student.id } },
              orderBy: { startsAt: 'asc' },
              take: input.pageSize,
              skip: input.range === 'ALL_PAGED' ? offset : 0,
            });
      const rows = meetings.map((meeting) => ({
        occurrence: meeting.occurrenceNumber,
        startsAt: iso(meeting.startsAt),
        endsAt: iso(meeting.endsAt),
        status: meeting.status,
        meetAvailable: Boolean(meeting.meetUrlEncrypted),
      }));
      const values = rows.map((row) => ({ ...row, recordHash: recordHash(row) }));
      const hasMore = input.range === 'ALL_PAGED' && meetings.length === input.pageSize;
      return {
        value: values,
        hashes: values.map((row) => row.recordHash),
        nextOffset: hasMore ? offset + meetings.length : undefined,
      };
    }

    const packagePeriod = await this.prisma.subscriptionPeriod.findFirst({
      where: {
        studentId: student.id,
        status: input.range === 'CURRENT_PACKAGE' ? 'ACTIVE' : { in: ['ACTIVE', 'SCHEDULED'] },
      },
      orderBy: { startDate: 'desc' },
    });
    const plan = await this.prisma.practicePlan.findFirst({
      where: {
        studentId: student.id,
        status: { in: ['ACTIVE', 'PAUSED'] },
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: asOf } }],
      },
      include: { slots: true },
      orderBy: { revision: 'desc' },
    });
    const packageRange =
      input.range === 'CURRENT_PACKAGE' && packagePeriod
        ? { serviceDate: { gte: packagePeriod.startDate, lt: packagePeriod.endExclusive } }
        : input.range === 'LAST_30_DAYS'
          ? { startAt: { gte: new Date(asOf.getTime() - 30 * 86400000), lte: asOf } }
          : {};
    const visibleStatuses = ['SCHEDULED', 'COMPLETED', 'SKIPPED', 'MISSED'] as const;
    type SessionWithSlot = Prisma.PracticeSessionGetPayload<{ include: { practiceSlot: true } }>;
    let sessions: SessionWithSlot[];
    let totals = { planned: 0, completed: 0, skipped: 0, missed: 0 };

    if (input.range === 'CURRENT_PACKAGE') {
      const [recentDescending, upcoming, statusCounts] = await Promise.all([
        this.prisma.practiceSession.findMany({
          where: {
            studentId: student.id,
            ...packageRange,
            status: { in: ['COMPLETED', 'SKIPPED', 'MISSED'] },
            startAt: { lte: asOf },
          },
          include: { practiceSlot: true },
          orderBy: { startAt: 'desc' },
          take: 5,
        }),
        this.prisma.practiceSession.findMany({
          where: {
            studentId: student.id,
            ...packageRange,
            status: 'SCHEDULED',
            startAt: { gte: asOf },
          },
          include: { practiceSlot: true },
          orderBy: { startAt: 'asc' },
          take: 3,
        }),
        this.prisma.practiceSession.groupBy({
          by: ['status'],
          where: { studentId: student.id, ...packageRange, status: { in: [...visibleStatuses] } },
          _count: { _all: true },
        }),
      ]);
      sessions = [...recentDescending.reverse(), ...upcoming];
      for (const row of statusCounts) {
        totals.planned += row._count._all;
        if (row.status === 'COMPLETED') totals.completed = row._count._all;
        if (row.status === 'SKIPPED') totals.skipped = row._count._all;
        if (row.status === 'MISSED') totals.missed = row._count._all;
      }
    } else {
      sessions = await this.prisma.practiceSession.findMany({
        where: { studentId: student.id, ...packageRange, status: { in: [...visibleStatuses] } },
        include: { practiceSlot: true },
        orderBy: { startAt: 'asc' },
        take: input.pageSize,
        skip: input.range === 'ALL_PAGED' ? offset : 0,
      });
      totals = sessions.reduce((acc, session) => {
        acc.planned += 1;
        if (session.status === 'COMPLETED') acc.completed += 1;
        if (session.status === 'SKIPPED') acc.skipped += 1;
        if (session.status === 'MISSED') acc.missed += 1;
        return acc;
      }, totals);
    }
    const sessionRows = sessions.map((session) => ({
      serviceDate: session.serviceDate.toISOString().slice(0, 10),
      startAt: iso(session.startAt),
      slot: session.practiceSlot?.slotKey ?? null,
      durationMinutes: session.durationMinutes,
      status: session.status,
    }));
    const sessionValues = sessionRows.map((row) => ({ ...row, recordHash: recordHash(row) }));
    const nextPractice = sessions.find(
      (session) => session.startAt >= asOf && session.status === 'SCHEDULED',
    );
    const planValue = plan
      ? {
          revision: plan.revision,
          status: plan.status,
          slots: plan.slots.map((slot) => ({
            slot: slot.slotKey,
            localTime: slot.localTime,
            durationMinutes: slot.durationMinutes,
            active: slot.active,
          })),
        }
      : null;
    const value = {
      asOf: iso(asOf),
      timezone: student.timezone,
      package: packagePeriod
        ? {
            startDate: packagePeriod.startDate.toISOString().slice(0, 10),
            endExclusive: packagePeriod.endExclusive.toISOString().slice(0, 10),
            status: packagePeriod.status,
          }
        : null,
      plan: planValue,
      sessions: sessionValues,
      totals: {
        ...totals,
        completionRate: totals.planned ? totals.completed / totals.planned : 0,
      },
      nextPractice: nextPractice
        ? {
            startAt: iso(nextPractice.startAt),
            slot: nextPractice.practiceSlot?.slotKey ?? null,
            durationMinutes: nextPractice.durationMinutes,
          }
        : null,
    };
    const valueHash = recordHash(value);
    const hasMore = input.range === 'ALL_PAGED' && sessions.length === input.pageSize;
    return {
      value: { ...value, recordHash: valueHash },
      hashes: [valueHash, ...sessionValues.map((row) => row.recordHash)],
      nextOffset: hasMore ? offset + sessions.length : undefined,
    };
  }

  private encodeCursor(payload: CursorPayload): string {
    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${raw}.${this.lookup.digest(raw)}`;
  }

  private decodeCursor(
    value: string | undefined,
    studentId: string,
    input: GetStudentContextInput,
  ): CursorPayload | undefined {
    if (!value) return undefined;
    const [raw, signature] = value.split('.', 2);
    if (!raw || !signature || !this.lookup.verify(raw, signature))
      throw new Error('Invalid context cursor.');
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as CursorPayload;
    if (
      payload.studentId !== studentId ||
      payload.range !== input.range ||
      payload.offset < 0 ||
      payload.offset > 10000 ||
      payload.sections.join(',') !== [...new Set(input.sections)].join(',')
    )
      throw new Error('Context cursor scope mismatch.');
    return payload;
  }
}
