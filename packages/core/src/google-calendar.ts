import { createHash, randomBytes } from 'node:crypto';

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
};

export type GoogleCalendarEvent = {
  id: string;
  etag?: string;
  status?: string;
  recurringEventId?: string;
  originalStartTime?: { dateTime?: string; timeZone?: string };
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

export type CreateRecurringCalendarEventInput = {
  calendarId: string;
  title: string;
  description: string;
  firstStartsAt: Date;
  firstEndsAt: Date;
  timezone: string;
  requestId: string;
};

export type GoogleCalendarListResult = {
  items: GoogleCalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
};

type FetchLike = typeof fetch;

export class GoogleCalendarSyncExpiredError extends Error {
  readonly status = 410;
  constructor() {
    super('Google Calendar sync token expired.');
    this.name = 'GoogleCalendarSyncExpiredError';
  }
}

export class GoogleCalendarHttpError extends Error {
  constructor(readonly status: number) {
    super(`Google Calendar request failed: ${status}`);
    this.name = 'GoogleCalendarHttpError';
  }
}

export class GoogleCalendarRestClient {
  private readonly request: FetchLike;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    request: FetchLike = fetch,
  ) {
    this.request = request;
  }

  authorizationUrl(state: string, codeChallenge: string, scopes: string[]): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenSet> {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
    return this.tokenRequest(body);
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenSet> {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
    });
    return this.tokenRequest(body, refreshToken);
  }

  async revokeToken(token: string): Promise<void> {
    const response = await this.request('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
    if (!response.ok && response.status !== 400)
      throw new Error(`Google revoke failed: ${response.status}`);
  }

  async createCalendar(accessToken: string, summary: string, timezone: string) {
    return this.apiRequest<{ id: string; summary?: string }>(accessToken, '/calendars', {
      method: 'POST',
      body: JSON.stringify({
        summary,
        timeZone: timezone,
        description: 'Meditasyon öğrenci portalı görüşmeleri',
      }),
    });
  }

  async createRecurringEvent(
    accessToken: string,
    input: CreateRecurringCalendarEventInput,
  ): Promise<GoogleCalendarEvent> {
    const eventId = deterministicEventId(input.requestId);
    const path = `/calendars/${encodeURIComponent(input.calendarId)}/events?conferenceDataVersion=1&sendUpdates=none`;
    try {
      return await this.apiRequest<GoogleCalendarEvent>(accessToken, path, {
        method: 'POST',
        body: JSON.stringify({
          id: eventId,
          summary: input.title,
          description: input.description,
          start: { dateTime: input.firstStartsAt.toISOString(), timeZone: input.timezone },
          end: { dateTime: input.firstEndsAt.toISOString(), timeZone: input.timezone },
          recurrence: ['RRULE:FREQ=WEEKLY;COUNT=4'],
          conferenceData: {
            createRequest: {
              requestId: input.requestId,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      });
    } catch (error) {
      if (error instanceof GoogleCalendarHttpError && error.status === 409) {
        return this.getEvent(accessToken, input.calendarId, eventId);
      }
      throw error;
    }
  }

  async updateEventInstance(
    accessToken: string,
    calendarId: string,
    eventId: string,
    startsAt: Date,
    endsAt: Date,
    timezone: string,
    etag?: string,
  ): Promise<GoogleCalendarEvent> {
    return this.apiRequest<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: etag ? { 'if-match': etag } : undefined,
        body: JSON.stringify({
          status: 'confirmed',
          start: { dateTime: startsAt.toISOString(), timeZone: timezone },
          end: { dateTime: endsAt.toISOString(), timeZone: timezone },
        }),
      },
    );
  }

  async cancelEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    etag?: string,
  ): Promise<GoogleCalendarEvent> {
    return this.apiRequest<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      {
        method: 'PATCH',
        headers: etag ? { 'if-match': etag } : undefined,
        body: JSON.stringify({ status: 'cancelled' }),
      },
    );
  }

  async getEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<GoogleCalendarEvent> {
    return this.apiRequest<GoogleCalendarEvent>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: 'GET' },
    );
  }

  async listEvents(
    accessToken: string,
    calendarId: string,
    options: {
      syncToken?: string;
      pageToken?: string;
      timeMin?: Date;
      singleEvents?: boolean;
    } = {},
  ): Promise<GoogleCalendarListResult> {
    const query = new URLSearchParams({
      singleEvents: options.singleEvents ? 'true' : 'false',
      showDeleted: 'true',
      maxResults: '2500',
    });
    if (options.syncToken) query.set('syncToken', options.syncToken);
    if (options.pageToken) query.set('pageToken', options.pageToken);
    if (options.timeMin) query.set('timeMin', options.timeMin.toISOString());
    return this.apiRequest<GoogleCalendarListResult>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
      { method: 'GET' },
    );
  }

  async listInstances(accessToken: string, calendarId: string, recurringEventId: string) {
    return this.apiRequest<GoogleCalendarListResult>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(recurringEventId)}/instances?maxResults=100&showDeleted=true`,
      { method: 'GET' },
    );
  }

  private async tokenRequest(
    body: URLSearchParams,
    fallbackRefreshToken?: string,
  ): Promise<GoogleTokenSet> {
    const response = await this.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
    const value = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!value.access_token) throw new Error('Google token response has no access token.');
    return {
      accessToken: value.access_token,
      refreshToken: value.refresh_token ?? fallbackRefreshToken,
      expiresAt: value.expires_in
        ? new Date(new Date().getTime() + value.expires_in * 1000)
        : undefined,
    };
  }

  private async apiRequest<T>(
    accessToken: string,
    path: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<T> {
    const response = await this.request(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        ...init.headers,
      },
    });
    if (response.status === 410) throw new GoogleCalendarSyncExpiredError();
    if (!response.ok) throw new GoogleCalendarHttpError(response.status);
    return (await response.json()) as T;
  }
}

function deterministicEventId(requestId: string): string {
  const value = createHash('sha256').update(requestId).digest('hex').slice(0, 32);
  return value.startsWith('-') ? `m${value.slice(1)}` : `m${value.slice(0, 31)}`;
}

export function createPkceVerifier(): string {
  return randomBytes(48).toString('base64url');
}

export function createPkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
