import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK_TOKEN,
  FieldEncryption,
  LookupHmac,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import { ChannelIdentityStatus, ChannelType } from '@meditation/database';
import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class ChannelLinkService {
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Channel encryption keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }
  async create(studentId: string, channel: ChannelType) {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const record = await this.prisma.channelLinkToken.create({
      data: {
        studentId,
        channel,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(now.getTime() + 900000),
      },
    });
    return { id: record.id, token, expiresAt: record.expiresAt };
  }
  async consume(token: string, accountExternalId: string, externalUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const link = await tx.channelLinkToken.findUniqueOrThrow({
        where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      });
      const now = this.clock.now();
      if (link.usedAt || link.revokedAt || link.expiresAt <= now)
        throw new Error('Channel link token is invalid or expired.');
      const account = await tx.channelAccount.findUniqueOrThrow({
        where: { type_externalId: { type: link.channel, externalId: accountExternalId } },
      });
      const hmac = this.lookup.digest(externalUserId);
      const encrypted = this.encryption.encrypt(externalUserId, `channel:${account.id}`);
      const identity = await tx.studentChannelIdentity.upsert({
        where: {
          channelAccountId_externalUserHmac: {
            channelAccountId: account.id,
            externalUserHmac: hmac,
          },
        },
        create: {
          studentId: link.studentId,
          channelAccountId: account.id,
          externalUserEncrypted: new Uint8Array(encrypted.ciphertext),
          externalUserKeyId: encrypted.keyId,
          externalUserHmac: hmac,
          status: ChannelIdentityStatus.ACTIVE,
          verifiedAt: now,
        },
        update: { status: ChannelIdentityStatus.ACTIVE, verifiedAt: now },
      });
      await tx.channelLinkToken.update({ where: { id: link.id }, data: { usedAt: now } });
      const student = await tx.student.findUniqueOrThrow({ where: { id: link.studentId } });
      if (!student.defaultChannelIdentityId)
        await tx.student.update({
          where: { id: student.id },
          data: { defaultChannelIdentityId: identity.id, version: { increment: 1 } },
        });
      return identity;
    });
  }
  async setDefault(studentId: string, identityId: string, expectedVersion: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.studentChannelIdentity.findFirstOrThrow({
        where: { id: identityId, studentId, status: ChannelIdentityStatus.ACTIVE },
      });
      const changed = await tx.student.updateMany({
        where: { id: studentId, version: expectedVersion },
        data: { defaultChannelIdentityId: identityId, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error('Student version conflict.');
      return tx.student.findUniqueOrThrow({ where: { id: studentId } });
    });
  }
}
