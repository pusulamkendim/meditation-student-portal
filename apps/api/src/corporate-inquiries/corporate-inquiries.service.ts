import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  LookupHmac,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { CorporateInquiryStatus } from '@meditation/database';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

export const CORPORATE_PRIVACY_NOTICE_VERSION = 'corporate-inquiry-v1';

export type CorporateInquiryInput = {
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  note: string;
  sessionId?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
};

type EncryptedField = { ciphertext: Buffer; keyId: string };

@Injectable()
export class CorporateInquiriesService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Corporate inquiry encryption and lookup keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async create(input: CorporateInquiryInput, sourceIp: string): Promise<{ id: string }> {
    const now = this.clock.now();
    const id = randomUUID();
    const email = input.email.trim().toLocaleLowerCase('en-US');
    const emailHmac = this.lookup.digest(email);
    const sourceIpHmac = this.lookup.digest(sourceIp);
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);

    const [ipSubmissions, emailSubmissions] = await Promise.all([
      this.prisma.corporateInquiry.count({
        where: { sourceIpHmac, createdAt: { gte: hourAgo } },
      }),
      this.prisma.corporateInquiry.count({
        where: { emailHmac, createdAt: { gte: dayAgo } },
      }),
    ]);
    if (ipSubmissions >= 5 || emailSubmissions >= 3) {
      throw new CorporateInquiryRateLimitError();
    }

    const firstName = this.encrypt(id, 'first-name', input.firstName.trim());
    const lastName = this.encrypt(id, 'last-name', input.lastName.trim());
    const encryptedEmail = this.encrypt(id, 'email', email);
    const company = this.encrypt(id, 'company', input.company.trim());
    const note = this.encrypt(id, 'note', input.note.trim());

    await this.prisma.$transaction(async (tx) => {
      await tx.corporateInquiry.create({
        data: {
          id,
          firstNameEncrypted: new Uint8Array(firstName.ciphertext),
          firstNameKeyId: firstName.keyId,
          lastNameEncrypted: new Uint8Array(lastName.ciphertext),
          lastNameKeyId: lastName.keyId,
          emailEncrypted: new Uint8Array(encryptedEmail.ciphertext),
          emailKeyId: encryptedEmail.keyId,
          emailHmac,
          companyEncrypted: new Uint8Array(company.ciphertext),
          companyKeyId: company.keyId,
          noteEncrypted: new Uint8Array(note.ciphertext),
          noteKeyId: note.keyId,
          sourceIpHmac,
          sessionId: input.sessionId,
          source: input.utm_source,
          medium: input.utm_medium,
          campaign: input.utm_campaign,
          privacyNoticeVersion: CORPORATE_PRIVACY_NOTICE_VERSION,
          privacyNoticeAcceptedAt: now,
          lastActivityAt: now,
        },
      });
      await tx.outboxEvent.createMany({
        data: [
          {
            topic: 'admin.notifications',
            aggregateType: 'CorporateInquiry',
            aggregateId: id,
            eventType: 'CORPORATE_INQUIRY_RECEIVED',
            payload: { inquiryId: id },
          },
          {
            topic: 'corporate.inquiry-email',
            aggregateType: 'CorporateInquiry',
            aggregateId: id,
            eventType: 'CorporateInquiryReceived',
            payload: { inquiryId: id },
          },
        ],
      });
    });
    return { id };
  }

  async list() {
    const inquiries = await this.prisma.corporateInquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return inquiries.map((inquiry) => ({
      id: inquiry.id,
      status: inquiry.status,
      firstName: this.decryptOptional(
        inquiry.id,
        'first-name',
        inquiry.firstNameEncrypted,
        inquiry.firstNameKeyId,
      ),
      lastName: this.decryptOptional(
        inquiry.id,
        'last-name',
        inquiry.lastNameEncrypted,
        inquiry.lastNameKeyId,
      ),
      company: this.decryptOptional(
        inquiry.id,
        'company',
        inquiry.companyEncrypted,
        inquiry.companyKeyId,
      ),
      source: inquiry.source,
      medium: inquiry.medium,
      campaign: inquiry.campaign,
      personalDataDeletedAt: inquiry.personalDataDeletedAt,
      createdAt: inquiry.createdAt,
      updatedAt: inquiry.updatedAt,
    }));
  }

  async detail(id: string) {
    const inquiry = await this.prisma.corporateInquiry.findUniqueOrThrow({ where: { id } });
    return {
      id: inquiry.id,
      status: inquiry.status,
      firstName: this.decryptOptional(
        inquiry.id,
        'first-name',
        inquiry.firstNameEncrypted,
        inquiry.firstNameKeyId,
      ),
      lastName: this.decryptOptional(
        inquiry.id,
        'last-name',
        inquiry.lastNameEncrypted,
        inquiry.lastNameKeyId,
      ),
      email: this.decryptOptional(inquiry.id, 'email', inquiry.emailEncrypted, inquiry.emailKeyId),
      company: this.decryptOptional(
        inquiry.id,
        'company',
        inquiry.companyEncrypted,
        inquiry.companyKeyId,
      ),
      note: this.decryptOptional(inquiry.id, 'note', inquiry.noteEncrypted, inquiry.noteKeyId),
      sessionId: inquiry.sessionId,
      source: inquiry.source,
      medium: inquiry.medium,
      campaign: inquiry.campaign,
      privacyNoticeVersion: inquiry.privacyNoticeVersion,
      privacyNoticeAcceptedAt: inquiry.privacyNoticeAcceptedAt,
      retentionDeleteAt: inquiry.retentionDeleteAt,
      personalDataDeletedAt: inquiry.personalDataDeletedAt,
      createdAt: inquiry.createdAt,
      updatedAt: inquiry.updatedAt,
    };
  }

  async updateStatus(id: string, status: CorporateInquiryStatus) {
    const now = this.clock.now();
    const retentionDeleteAt =
      status === CorporateInquiryStatus.CONTACTED || status === CorporateInquiryStatus.CLOSED
        ? new Date(now.getTime() + 365 * 24 * 60 * 60_000)
        : null;
    return this.prisma.corporateInquiry.update({
      where: { id },
      data: { status, lastActivityAt: now, retentionDeleteAt },
      select: { id: true, status: true, updatedAt: true, retentionDeleteAt: true },
    });
  }

  async auditView(adminId: string, inquiryId: string): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        action: 'CORPORATE_INQUIRY_VIEWED',
        entityType: 'CorporateInquiry',
        entityId: inquiryId,
        safeDiff: { fields: ['contact', 'company', 'note'] },
        reason: 'Corporate inquiry detail viewed in admin portal',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }

  private encrypt(id: string, field: string, value: string): EncryptedField {
    return this.encryption.encrypt(value, `corporate-inquiry:${id}:${field}`);
  }

  private decryptOptional(
    id: string,
    field: string,
    ciphertext: Uint8Array | null,
    keyId: string | null,
  ): string | undefined {
    if (!ciphertext || !keyId) return undefined;
    return this.encryption.decrypt(
      { ciphertext: Buffer.from(ciphertext), keyId },
      `corporate-inquiry:${id}:${field}`,
    );
  }
}

export class CorporateInquiryRateLimitError extends Error {
  constructor() {
    super('Corporate inquiry submission rate limit exceeded.');
    this.name = 'CorporateInquiryRateLimitError';
  }
}
