import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  transitionRegistration,
  type ApplicationConfig,
  type Clock,
  type RegistrationCommand,
} from '@meditation/core';
import {
  ChannelType,
  ConsentScope,
  ConsentStatus,
  RegistrationStep,
  StudentStatus,
} from '@meditation/database';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class RegistrationService {
  private readonly encryption: FieldEncryption;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID)
      throw new Error('Registration encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }
  async advance(
    studentId: string,
    command: RegistrationCommand,
    input: {
      channel: ChannelType;
      externalMessageId: string;
      name?: string;
      noticeVersion?: string;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      const next = transitionRegistration(student.registrationStep, command) as RegistrationStep;
      const now = this.clock.now();
      if (command === 'PRIVACY_ACCEPTED')
        await tx.privacyNoticeReceipt.create({
          data: {
            studentId,
            noticeVersion: input.noticeVersion ?? 'v1',
            channel: input.channel,
            deliveredAt: now,
            externalMessageId: input.externalMessageId,
          },
        });
      if (command === 'CHANNEL_ACCEPTED')
        await tx.consent.create({
          data: {
            studentId,
            scope: ConsentScope.MESSAGING,
            status: ConsentStatus.GRANTED,
            textVersion: 'v1',
            channel: input.channel,
            externalMessageId: input.externalMessageId,
            occurredAt: now,
          },
        });
      if (command === 'AI_ACCEPTED' || command === 'AI_DECLINED')
        await tx.consent.create({
          data: {
            studentId,
            scope: ConsentScope.AGENT_REPLY_AI,
            status: command === 'AI_ACCEPTED' ? ConsentStatus.GRANTED : ConsentStatus.WITHDRAWN,
            textVersion: 'v1',
            channel: input.channel,
            externalMessageId: input.externalMessageId,
            occurredAt: now,
          },
        });
      const data: Record<string, unknown> = { registrationStep: next, version: { increment: 1 } };
      if (command === 'NAME_RECEIVED' && input.name) {
        const name = this.encryption.encrypt(input.name, `student:${studentId}:name`);
        data.fullNameEncrypted = new Uint8Array(name.ciphertext);
        data.fullNameKeyId = name.keyId;
      }
      const changed = await tx.student.updateMany({
        where: {
          id: studentId,
          version: student.version,
          registrationStep: student.registrationStep,
        },
        data,
      });
      if (changed.count !== 1) throw new Error('Registration state conflict.');
      return tx.student.findUniqueOrThrow({ where: { id: studentId } });
    });
  }
  async reportPayment(studentId: string, externalMessageId: string, proofStorageKey?: string) {
    const now = this.clock.now();
    const referenceCode = `MED-${randomBytes(4).toString('hex').toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
      const next = transitionRegistration(
        student.registrationStep,
        'PAYMENT_REPORTED',
      ) as RegistrationStep;
      const payment = await tx.payment.create({
        data: {
          studentId,
          amountMinor: 400000,
          referenceCode,
          reportedAt: now,
          proofStorageKey,
          proofDeleteAfter: proofStorageKey ? new Date(now.getTime() + 30 * 86400000) : undefined,
        },
      });
      await tx.student.update({
        where: { id: studentId },
        data: {
          status: StudentStatus.PAYMENT_PENDING,
          registrationStep: next,
          version: { increment: 1 },
        },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'admin.notifications',
          aggregateType: 'Payment',
          aggregateId: payment.id,
          eventType: 'ADMIN_PAYMENT_REVIEW_REQUIRED',
          payload: { paymentId: payment.id, externalMessageId },
        },
      });
      return payment;
    });
  }

  async withdrawConsent(
    studentId: string,
    scope: ConsentScope,
    channel: ChannelType,
    externalMessageId: string,
  ) {
    return this.recordConsent(
      studentId,
      scope,
      ConsentStatus.WITHDRAWN,
      channel,
      externalMessageId,
    );
  }

  async recordConsent(
    studentId: string,
    scope: ConsentScope,
    status: ConsentStatus,
    channel: ChannelType,
    externalMessageId: string,
  ) {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const consent = await tx.consent.create({
        data: {
          studentId,
          scope,
          status,
          textVersion: 'v1',
          channel,
          externalMessageId,
          occurredAt: now,
        },
      });
      if (scope === ConsentScope.MESSAGING && status === ConsentStatus.WITHDRAWN)
        await tx.messagingPreference.upsert({
          where: { studentId },
          create: {
            studentId,
            proactiveEnabled: false,
            pausedAt: now,
            pauseReason: 'CONSENT_WITHDRAWN',
          },
          update: {
            proactiveEnabled: false,
            pausedAt: now,
            pauseReason: 'CONSENT_WITHDRAWN',
            version: { increment: 1 },
          },
        });
      await tx.outboxEvent.create({
        data: {
          topic: 'student.events',
          aggregateType: 'Consent',
          aggregateId: consent.id,
          eventType: status === ConsentStatus.GRANTED ? 'CONSENT_GRANTED' : 'CONSENT_WITHDRAWN',
          payload: { studentId, scope, status },
        },
      });
      return consent;
    });
  }
}
