import { describe, expect, it } from 'vitest';

import { GoogleCalendarRestClient, GoogleCalendarSyncExpiredError } from './google-calendar.js';

describe('Google Calendar contract', () => {
  it('creates a four-occurrence Meet series without student PII', async () => {
    let requestBody = '';
    const request = (async (_url: string, init?: RequestInit) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'mabc123',
          etag: '"1"',
          conferenceData: {
            entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/test' }],
          },
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const client = new GoogleCalendarRestClient(
      'client',
      'secret',
      'http://localhost/callback',
      request,
    );
    const url = client.authorizationUrl('state', 'challenge', [
      'https://www.googleapis.com/auth/calendar',
    ]);
    expect(url).toContain('access_type=offline');
    expect(url).toContain('code_challenge=challenge');
    const event = await client.createRecurringEvent('token', {
      calendarId: 'portal',
      title: 'Meditasyon Görüşmesi · M-A1B2',
      description: 'Meditasyon öğrenci portalı görüşmesi.',
      firstStartsAt: new Date('2026-07-13T07:00:00.000Z'),
      firstEndsAt: new Date('2026-07-13T08:00:00.000Z'),
      timezone: 'Europe/Istanbul',
      requestId: 'series-id',
    });
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(body.summary).toBe('Meditasyon Görüşmesi · M-A1B2');
    expect(body.description).not.toContain('Öğrenci');
    expect(body.recurrence).toEqual(['RRULE:FREQ=WEEKLY;COUNT=4']);
    expect(event.conferenceData?.entryPoints?.[0]?.uri).toContain('meet.google.com');
  });

  it('surfaces 410 as a full-sync signal', async () => {
    const request = (async () => ({
      ok: false,
      status: 410,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    const client = new GoogleCalendarRestClient(
      'client',
      'secret',
      'http://localhost/callback',
      request,
    );
    await expect(
      client.listEvents('token', 'portal', { syncToken: 'expired' }),
    ).rejects.toBeInstanceOf(GoogleCalendarSyncExpiredError);
  });

  it('restores a cancelled instance when updating its schedule', async () => {
    let requestBody = '';
    const request = (async (_url: string, init?: RequestInit) => {
      requestBody = String(init?.body ?? '');
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: 'instance-1', status: 'confirmed' }),
      } as Response;
    }) as unknown as typeof fetch;
    const client = new GoogleCalendarRestClient(
      'client',
      'secret',
      'http://localhost/callback',
      request,
    );

    await client.updateEventInstance(
      'token',
      'portal',
      'instance-1',
      new Date('2026-07-14T07:00:00.000Z'),
      new Date('2026-07-14T08:00:00.000Z'),
      'Europe/Istanbul',
    );

    expect(JSON.parse(requestBody)).toMatchObject({ status: 'confirmed' });
  });
});
