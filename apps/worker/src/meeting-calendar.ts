import {
  FieldEncryption,
  GoogleCalendarRestClient,
  GoogleCalendarSyncExpiredError,
  meetingReference,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  CalendarDiscrepancyStatus,
  CalendarSyncStatus,
  ConferenceStatus,
  GoogleCalendarConnectionStatus,
  PrismaClient,
} from '@meditation/database';
import { createMeetingSeriesIntent } from './meeting-lifecycle.js';

type CalendarConfig = Pick<
  ApplicationConfig,
  | 'DATA_ENCRYPTION_KEYS_JSON'
  | 'ACTIVE_DATA_KEY_ID'
  | 'GOOGLE_OAUTH_CLIENT_ID'
  | 'GOOGLE_OAUTH_CLIENT_SECRET'
  | 'GOOGLE_OAUTH_REDIRECT_URI'
>;

export class MeetingCalendarWorker {
  private readonly encryption: FieldEncryption;
  private readonly client?: GoogleCalendarRestClient;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: CalendarConfig,
    private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Worker encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    if (
      config.GOOGLE_OAUTH_CLIENT_ID &&
      config.GOOGLE_OAUTH_CLIENT_SECRET &&
      config.GOOGLE_OAUTH_REDIRECT_URI
    ) {
      this.client = new GoogleCalendarRestClient(
        config.GOOGLE_OAUTH_CLIENT_ID,
        config.GOOGLE_OAUTH_CLIENT_SECRET,
        config.GOOGLE_OAUTH_REDIRECT_URI,
      );
    }
  }

  async createSeries(seriesId: string): Promise<void> {
    if (!this.client) return;
    const series = await this.prisma.meetingSeries.findUnique({
      where: { id: seriesId },
      include: { meetings: { orderBy: { occurrenceNumber: 'asc' } } },
    });
    if (!series) return;
    const access = await this.accessToken();
    if (!access) return;
    if (series.googleSeriesId) {
      const event = await this.client.getEvent(
        access.accessToken,
        series.googleCalendarId ?? access.calendarId,
        series.googleSeriesId,
      );
      const meetUrl = event.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video' && entry.uri,
      )?.uri;
      if (!meetUrl) return;
      const encryptedMeetUrl = this.encryption.encrypt(
        meetUrl,
        `meeting-series:${series.id}:meet-url`,
      );
      await this.prisma.meetingSeries.update({
        where: { id: series.id },
        data: {
          conferenceStatus: ConferenceStatus.READY,
          calendarSyncStatus: CalendarSyncStatus.SYNCED,
          meetUrlEncrypted: new Uint8Array(encryptedMeetUrl.ciphertext),
          meetUrlKeyId: encryptedMeetUrl.keyId,
          googleEtag: event.etag,
          lastCalendarSyncAt: this.clock.now(),
        },
      });
      await this.mapInstances(
        series.id,
        series.googleSeriesId,
        access.accessToken,
        series.googleCalendarId ?? access.calendarId,
      );
      await createMeetingSeriesIntent(this.prisma, this.clock, this.config, series.id);
      return;
    }
    try {
      const first = series.meetings[0];
      if (!first) return;
      const event = await this.client.createRecurringEvent(access.accessToken, {
        calendarId: access.calendarId,
        title: `Meditasyon Görüşmesi · ${meetingReference(series.id)}`,
        description: 'Meditasyon öğrenci portalı görüşmesi.',
        firstStartsAt: first.startsAt,
        firstEndsAt: first.endsAt,
        timezone: series.timezone,
        requestId: series.id,
      });
      const meetUrl = event.conferenceData?.entryPoints?.find(
        (entry) => entry.entryPointType === 'video' && entry.uri,
      )?.uri;
      const encryptedMeetUrl = meetUrl
        ? this.encryption.encrypt(meetUrl, `meeting-series:${series.id}:meet-url`)
        : undefined;
      await this.prisma.meetingSeries.update({
        where: { id: series.id },
        data: {
          googleSeriesId: event.id,
          googleCalendarId: access.calendarId,
          googleEtag: event.etag,
          calendarSyncStatus: CalendarSyncStatus.SYNCED,
          conferenceStatus: meetUrl ? ConferenceStatus.READY : ConferenceStatus.PENDING,
          meetUrlEncrypted: encryptedMeetUrl
            ? new Uint8Array(encryptedMeetUrl.ciphertext)
            : undefined,
          meetUrlKeyId: encryptedMeetUrl?.keyId,
          lastCalendarSyncAt: this.clock.now(),
        },
      });
      await this.mapInstances(series.id, event.id, access.accessToken, access.calendarId);
      if (meetUrl) await createMeetingSeriesIntent(this.prisma, this.clock, this.config, series.id);
    } catch (error) {
      await this.prisma.meetingSeries.update({
        where: { id: series.id },
        data: {
          calendarSyncStatus: CalendarSyncStatus.FAILED,
          conferenceStatus: ConferenceStatus.FAILED,
        },
      });
      throw error;
    }
  }

  async updateMeeting(meetingId: string): Promise<void> {
    if (!this.client) return;
    const meeting = await this.prisma.weeklyMeeting.findUnique({
      where: { id: meetingId },
      include: { meetingSeries: true },
    });
    if (!meeting || !meeting.meetingSeries.googleSeriesId || !meeting.googleInstanceId) return;
    const access = await this.accessToken();
    if (!access) return;
    try {
      const event =
        meeting.status === 'CANCELLED'
          ? await this.client.cancelEvent(
              access.accessToken,
              meeting.meetingSeries.googleCalendarId ?? access.calendarId,
              meeting.googleInstanceId,
              meeting.googleEtag ?? undefined,
            )
          : await this.client.updateEventInstance(
              access.accessToken,
              meeting.meetingSeries.googleCalendarId ?? access.calendarId,
              meeting.googleInstanceId,
              meeting.startsAt,
              meeting.endsAt,
              meeting.meetingSeries.timezone,
              meeting.googleEtag ?? undefined,
            );
      await this.prisma.weeklyMeeting.update({
        where: { id: meetingId },
        data: {
          googleEtag: event.etag,
          calendarSyncStatus: CalendarSyncStatus.SYNCED,
          lastCalendarSyncAt: this.clock.now(),
        },
      });
    } catch (error) {
      await this.prisma.weeklyMeeting.update({
        where: { id: meetingId },
        data: { calendarSyncStatus: CalendarSyncStatus.FAILED },
      });
      throw error;
    }
  }

  async updateSeries(seriesId: string): Promise<void> {
    const series = await this.prisma.meetingSeries.findUnique({
      where: { id: seriesId },
      include: { meetings: true },
    });
    if (!series) return;
    if (!series.googleSeriesId) {
      await this.createSeries(seriesId);
      return;
    }
    for (const meeting of series.meetings.filter((item) => item.status === 'SCHEDULED')) {
      await this.updateMeeting(meeting.id);
    }
    await createMeetingSeriesIntent(this.prisma, this.clock, this.config, series.id);
  }

  async incrementalSync(full = false): Promise<void> {
    if (!this.client) return;
    const access = await this.accessToken();
    if (!access) return;
    const pendingSeries = await this.prisma.meetingSeries.findMany({
      where: { conferenceStatus: { in: [ConferenceStatus.PENDING, ConferenceStatus.FAILED] } },
      select: { id: true },
      take: 100,
    });
    for (const series of pendingSeries) await this.createSeries(series.id);
    const state = await this.prisma.googleCalendarSyncState.findUnique({
      where: { id: 'default' },
    });
    const syncToken =
      state?.syncTokenEncrypted && state.syncTokenKeyId
        ? this.encryption.decrypt(
            { ciphertext: Buffer.from(state.syncTokenEncrypted), keyId: state.syncTokenKeyId },
            'google-calendar:sync-token',
          )
        : undefined;
    try {
      const now = this.clock.now();
      let pageToken: string | undefined;
      let nextSyncToken: string | undefined;
      do {
        const result = await this.client.listEvents(
          access.accessToken,
          access.calendarId,
          full || !syncToken
            ? { timeMin: new Date(now.getTime() - 90 * 86_400_000), singleEvents: true, pageToken }
            : { syncToken, singleEvents: true, pageToken },
        );
        for (const event of result.items) await this.recordDiscrepancy(event);
        pageToken = result.nextPageToken;
        nextSyncToken = result.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      const encrypted = nextSyncToken
        ? this.encryption.encrypt(nextSyncToken, 'google-calendar:sync-token')
        : undefined;
      const syncedAt = this.clock.now();
      await this.prisma.googleCalendarSyncState.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          syncTokenEncrypted: encrypted ? new Uint8Array(encrypted.ciphertext) : undefined,
          syncTokenKeyId: encrypted?.keyId,
          lastIncrementalSyncAt: syncedAt,
          lastFullSyncAt: full ? syncedAt : undefined,
          nextFullReconcileAt: new Date(syncedAt.getTime() + 60 * 60_000),
        },
        update: {
          syncTokenEncrypted: encrypted ? new Uint8Array(encrypted.ciphertext) : undefined,
          syncTokenKeyId: encrypted?.keyId,
          lastIncrementalSyncAt: syncedAt,
          lastFullSyncAt: full ? syncedAt : undefined,
          nextFullReconcileAt: new Date(syncedAt.getTime() + 60 * 60_000),
          version: { increment: 1 },
        },
      });
      await this.prisma.googleCalendarIntegration.update({
        where: { id: 'default' },
        data: { status: GoogleCalendarConnectionStatus.CONNECTED, lastSuccessfulSyncAt: syncedAt },
      });
    } catch (error) {
      if (error instanceof GoogleCalendarSyncExpiredError) {
        await this.prisma.googleCalendarSyncState.updateMany({
          where: { id: 'default' },
          data: { syncTokenEncrypted: null, syncTokenKeyId: null, version: { increment: 1 } },
        });
        await this.incrementalSync(true);
        return;
      }
      throw error;
    }
  }

  private async mapInstances(
    seriesId: string,
    recurringEventId: string,
    accessToken: string,
    calendarId: string,
  ) {
    if (!this.client) return;
    const result = await this.client.listInstances(accessToken, calendarId, recurringEventId);
    const series = await this.prisma.meetingSeries.findUnique({
      where: { id: seriesId },
      include: { meetings: true },
    });
    if (!series) return;
    for (const event of result.items) {
      const observed = event.originalStartTime?.dateTime ?? event.start?.dateTime;
      if (!observed) continue;
      const target = series.meetings.reduce(
        (best, meeting) =>
          Math.abs(meeting.startsAt.getTime() - new Date(observed).getTime()) <
          Math.abs(best.startsAt.getTime() - new Date(observed).getTime())
            ? meeting
            : best,
        series.meetings[0]!,
      );
      await this.prisma.weeklyMeeting.update({
        where: { id: target.id },
        data: {
          googleInstanceId: event.id,
          googleEtag: event.etag,
          calendarSyncStatus: CalendarSyncStatus.SYNCED,
          lastCalendarSyncAt: this.clock.now(),
        },
      });
    }
  }

  private async recordDiscrepancy(event: {
    id: string;
    recurringEventId?: string;
    status?: string;
    etag?: string;
    start?: { dateTime?: string };
  }) {
    if (!event.recurringEventId) {
      const series = await this.prisma.meetingSeries.findFirst({
        where: { googleSeriesId: event.id },
      });
      if (!series || series.googleEtag === event.etag) return;
      const existing = await this.prisma.calendarDiscrepancy.findFirst({
        where: {
          meetingSeriesId: series.id,
          type: 'EXTERNAL_SERIES_CHANGED',
          status: CalendarDiscrepancyStatus.OPEN,
          observedEtag: event.etag,
        },
      });
      if (!existing) {
        await this.prisma.calendarDiscrepancy.create({
          data: {
            meetingSeriesId: series.id,
            type: 'EXTERNAL_SERIES_CHANGED',
            status: CalendarDiscrepancyStatus.OPEN,
            expectedEtag: series.googleEtag,
            observedEtag: event.etag,
            details: { policy: 'portal-source-of-truth', googleEventId: event.id },
          },
        });
        await this.prisma.meetingSeries.update({
          where: { id: series.id },
          data: { calendarSyncStatus: CalendarSyncStatus.DISCREPANCY },
        });
      }
      return;
    }
    const series = await this.prisma.meetingSeries.findFirst({
      where: { googleSeriesId: event.recurringEventId },
      include: { meetings: true },
    });
    if (!series) return;
    const observed = event.start?.dateTime ? new Date(event.start.dateTime) : undefined;
    const meeting =
      series.meetings.find((item) => item.googleInstanceId === event.id) ??
      series.meetings.find(
        (item) => observed && Math.abs(item.startsAt.getTime() - observed.getTime()) < 120_000,
      );
    if (
      !meeting ||
      (observed &&
        Math.abs(meeting.startsAt.getTime() - observed.getTime()) < 1000 &&
        meeting.googleEtag === event.etag &&
        event.status !== 'cancelled')
    )
      return;
    const discrepancyType =
      event.status === 'cancelled' ? 'EXTERNAL_CANCELLED' : 'EXTERNAL_CHANGED';
    const existing = await this.prisma.calendarDiscrepancy.findFirst({
      where: {
        meetingSeriesId: series.id,
        meetingId: meeting.id,
        type: discrepancyType,
        status: CalendarDiscrepancyStatus.OPEN,
        observedEtag: event.etag,
      },
    });
    if (existing) return;
    const discrepancy = await this.prisma.calendarDiscrepancy
      .create({
        data: {
          meetingSeriesId: series.id,
          meetingId: meeting?.id,
          type: discrepancyType,
          status: CalendarDiscrepancyStatus.OPEN,
          expectedStartsAt: meeting?.startsAt,
          observedStartsAt: observed,
          expectedEtag: meeting?.googleEtag,
          observedEtag: event.etag,
          details: { policy: 'portal-source-of-truth', googleEventId: event.id },
        },
      })
      .catch((error: unknown) => {
        if (!isUniqueConstraint(error)) throw error;
        return undefined;
      });
    if (meeting && discrepancy) {
      await this.prisma.weeklyMeeting.update({
        where: { id: meeting.id },
        data: { calendarSyncStatus: CalendarSyncStatus.DISCREPANCY },
      });
      const occurrenceKey = `calendar-discrepancy:${meeting.id}:${event.etag ?? event.id}`;
      const occurrence = await this.prisma.systemEventOccurrence.upsert({
        where: { idempotencyKey: occurrenceKey },
        create: {
          eventKey: 'ADMIN_CALENDAR_DISCREPANCY',
          studentId: series.studentId,
          idempotencyKey: occurrenceKey,
          variables: {
            studentReference: `M-${series.id.slice(0, 8).toUpperCase()}`,
            meetingReference: `M-${meeting.id.slice(0, 8).toUpperCase()}`,
            detailsText: discrepancyType,
          },
          occurredAt: this.clock.now(),
        },
        update: {},
      });
      const alertOutbox = await this.prisma.outboxEvent.findFirst({
        where: {
          topic: 'admin.notifications',
          aggregateId: meeting.id,
          eventType: 'CalendarDiscrepancy',
        },
      });
      if (!alertOutbox) {
        await this.prisma.outboxEvent.create({
          data: {
            topic: 'admin.notifications',
            aggregateType: 'WeeklyMeeting',
            aggregateId: meeting.id,
            eventType: 'CalendarDiscrepancy',
            payload: { occurrenceId: occurrence.id, discrepancyId: discrepancy.id },
          },
        });
      }
    }
  }

  private async accessToken(): Promise<{ accessToken: string; calendarId: string } | undefined> {
    if (!this.client) return undefined;
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    if (
      !integration?.refreshTokenEncrypted ||
      !integration.refreshTokenKeyId ||
      !integration.calendarId
    )
      return undefined;
    try {
      const refreshToken = this.encryption.decrypt(
        {
          ciphertext: Buffer.from(integration.refreshTokenEncrypted),
          keyId: integration.refreshTokenKeyId,
        },
        'google-calendar:refresh-token',
      );
      const token = await this.client.refreshAccessToken(refreshToken);
      return { accessToken: token.accessToken, calendarId: integration.calendarId };
    } catch (error) {
      await this.prisma.googleCalendarIntegration.update({
        where: { id: 'default' },
        data: { status: GoogleCalendarConnectionStatus.RECONNECT_REQUIRED },
      });
      throw error;
    }
  }
}

function isUniqueConstraint(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
