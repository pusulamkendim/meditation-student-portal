import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  createPkceChallenge,
  createPkceVerifier,
  FieldEncryption,
  GoogleCalendarRestClient,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { createHash, randomBytes } from 'node:crypto';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class GoogleCalendarService {
  private readonly encryption: FieldEncryption;
  private readonly client?: GoogleCalendarRestClient;
  private readonly scopes: string[];
  private readonly stateTtlSeconds: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Google Calendar encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.scopes = config.GOOGLE_CALENDAR_SCOPES.split(/\s+/).filter(Boolean);
    this.stateTtlSeconds = config.GOOGLE_OAUTH_STATE_TTL_SECONDS;
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

  async start(adminId: string): Promise<{ authorizationUrl: string; expiresAt: string }> {
    if (!this.client) throw new BadRequestException('Google Calendar OAuth is not configured.');
    const state = randomBytes(32).toString('base64url');
    const stateHash = hash(state);
    const verifier = createPkceVerifier();
    const encrypted = this.encryption.encrypt(verifier, `google-oauth:${stateHash}`);
    const expiresAt = new Date(this.clock.now().getTime() + this.stateTtlSeconds * 1000);
    await this.prisma.googleOAuthState.create({
      data: {
        stateHash,
        codeVerifierEncrypted: new Uint8Array(encrypted.ciphertext),
        codeVerifierKeyId: encrypted.keyId,
        adminUserId: adminId,
        expiresAt,
      },
    });
    return {
      authorizationUrl: this.client.authorizationUrl(
        state,
        createPkceChallenge(verifier),
        this.scopes,
      ),
      expiresAt: expiresAt.toISOString(),
    };
  }

  async status() {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    return {
      configured: Boolean(this.client),
      status: integration?.status ?? 'DISCONNECTED',
      calendarId: integration?.calendarId,
      calendarName: integration?.calendarName,
      lastSuccessfulSyncAt: integration?.lastSuccessfulSyncAt?.toISOString(),
    };
  }

  async callback(state: string, code: string, adminId?: string) {
    if (!this.client) throw new BadRequestException('Google Calendar OAuth is not configured.');
    const stateHash = hash(state);
    const oauthState = await this.prisma.googleOAuthState.findUnique({ where: { stateHash } });
    if (
      !oauthState ||
      (adminId && oauthState.adminUserId !== adminId) ||
      oauthState.usedAt ||
      oauthState.expiresAt <= this.clock.now()
    )
      throw new UnauthorizedException('OAuth state expired or already used.');
    const claimed = await this.prisma.googleOAuthState.updateMany({
      where: { id: oauthState.id, usedAt: null },
      data: { usedAt: this.clock.now() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('OAuth state already used.');
    const verifier = this.encryption.decrypt(
      {
        ciphertext: Buffer.from(oauthState.codeVerifierEncrypted),
        keyId: oauthState.codeVerifierKeyId,
      },
      `google-oauth:${stateHash}`,
    );
    const tokens = await this.client.exchangeCode(code, verifier);
    if (!tokens.refreshToken)
      throw new BadRequestException(
        'Google did not return a refresh token. Reconnect with consent.',
      );
    const refresh = this.encryption.encrypt(tokens.refreshToken, 'google-calendar:refresh-token');
    const existing = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    const calendar = existing?.calendarId
      ? { id: existing.calendarId, summary: existing.calendarName }
      : await this.client.createCalendar(
          tokens.accessToken,
          'Meditasyon Portalı',
          'Europe/Istanbul',
        );
    await this.prisma.googleCalendarIntegration.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        status: 'CONNECTED',
        refreshTokenEncrypted: new Uint8Array(refresh.ciphertext),
        refreshTokenKeyId: refresh.keyId,
        calendarId: calendar.id,
        calendarName: calendar.summary ?? 'Meditasyon Portalı',
      },
      update: {
        status: 'CONNECTED',
        refreshTokenEncrypted: new Uint8Array(refresh.ciphertext),
        refreshTokenKeyId: refresh.keyId,
        calendarId: calendar.id,
        calendarName: calendar.summary ?? 'Meditasyon Portalı',
        version: { increment: 1 },
      },
    });
    return { connected: true, calendarId: calendar.id };
  }

  async disconnect(): Promise<void> {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    if (integration?.refreshTokenEncrypted && integration.refreshTokenKeyId && this.client) {
      const token = this.encryption.decrypt(
        {
          ciphertext: Buffer.from(integration.refreshTokenEncrypted),
          keyId: integration.refreshTokenKeyId,
        },
        'google-calendar:refresh-token',
      );
      await this.client.revokeToken(token).catch(() => undefined);
    }
    await this.prisma.googleCalendarIntegration.upsert({
      where: { id: 'default' },
      create: { id: 'default', status: 'DISCONNECTED' },
      update: {
        status: 'DISCONNECTED',
        refreshTokenEncrypted: null,
        refreshTokenKeyId: null,
        version: { increment: 1 },
      },
    });
  }

  async getAccessToken(): Promise<{ accessToken: string; calendarId: string }> {
    if (!this.client) throw new BadRequestException('Google Calendar OAuth is not configured.');
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { id: 'default' },
    });
    if (
      !integration?.refreshTokenEncrypted ||
      !integration.refreshTokenKeyId ||
      !integration.calendarId
    )
      throw new UnauthorizedException('Google Calendar connection is required.');
    const refreshToken = this.encryption.decrypt(
      {
        ciphertext: Buffer.from(integration.refreshTokenEncrypted),
        keyId: integration.refreshTokenKeyId,
      },
      'google-calendar:refresh-token',
    );
    try {
      const tokens = await this.client.refreshAccessToken(refreshToken);
      if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
        const encrypted = this.encryption.encrypt(
          tokens.refreshToken,
          'google-calendar:refresh-token',
        );
        await this.prisma.googleCalendarIntegration.update({
          where: { id: 'default' },
          data: {
            refreshTokenEncrypted: new Uint8Array(encrypted.ciphertext),
            refreshTokenKeyId: encrypted.keyId,
          },
        });
      }
      return { accessToken: tokens.accessToken, calendarId: integration.calendarId };
    } catch (error) {
      await this.prisma.googleCalendarIntegration.update({
        where: { id: 'default' },
        data: { status: 'RECONNECT_REQUIRED' },
      });
      throw error;
    }
  }

  getClient(): GoogleCalendarRestClient {
    if (!this.client) throw new BadRequestException('Google Calendar OAuth is not configured.');
    return this.client;
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
