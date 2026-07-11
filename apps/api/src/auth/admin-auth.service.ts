import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import {
  type Clock,
  FieldEncryption,
  generateRecoveryCodes,
  generateTotpSecret,
  LookupHmac,
  CLOCK_TOKEN,
  verifyTotpCode,
} from '@meditation/core';
import { AuditActorType, type AdminRole } from '@meditation/database';

import { PrismaService } from '../database/prisma.service.js';
import { FIELD_ENCRYPTION, SESSION_HMAC } from './auth.constants.js';

const idleSessionMilliseconds = 30 * 60 * 1000;
const absoluteSessionMilliseconds = 12 * 60 * 60 * 1000;
const maximumLoginFailures = 5;
const lockoutMilliseconds = 15 * 60 * 1000;

export interface LoginInput {
  email: string;
  password: string;
  totpCode?: string;
  recoveryCode?: string;
  ip?: string;
  userAgent?: string;
  requestId: string;
}

export interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  expiresAt: Date;
  admin: { id: string; email: string; role: AdminRole };
}

export interface BootstrapResult {
  adminId: string;
  totpSecret: string;
  recoveryCodes: string[];
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
    @Inject(FIELD_ENCRYPTION) private readonly encryption: FieldEncryption,
    @Inject(SESSION_HMAC) private readonly sessionHmac: LookupHmac,
  ) {}

  static hashPassword(password: string): Promise<string> {
    return hash(password, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
  }

  async bootstrap(email: string, password: string, requestId: string): Promise<BootstrapResult> {
    if ((await this.prisma.adminUser.count()) > 0) {
      throw new Error('Admin bootstrap is disabled after the first admin is created.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await AdminAuthService.hashPassword(password);
    const totpSecret = generateTotpSecret();
    const encryptedTotp = this.encryption.encrypt(totpSecret, `admin:${normalizedEmail}:totp`);
    const recoveryCodes = generateRecoveryCodes();

    const admin = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.adminUser.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          totpSecretEncrypted: Uint8Array.from(encryptedTotp.ciphertext),
          totpSecretKeyId: encryptedTotp.keyId,
          totpEnabledAt: this.clock.now(),
          recoveryCodes: {
            create: recoveryCodes.map((code) => ({ codeHash: this.sessionHmac.digest(code) })),
          },
        },
      });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.SYSTEM,
          action: 'admin.bootstrap',
          entityType: 'AdminUser',
          entityId: created.id,
          requestId,
          correlationId: requestId,
        },
      });
      return created;
    });

    return { adminId: admin.id, totpSecret, recoveryCodes };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const now = this.clock.now();
    const email = input.email.trim().toLowerCase();
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.active || (admin.lockedUntil && admin.lockedUntil > now)) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordValid = await verify(admin.passwordHash, input.password);
    const totpSecret = this.decryptTotpSecret(admin);
    const totpValid = Boolean(
      totpSecret && input.totpCode && verifyTotpCode(totpSecret, input.totpCode, now),
    );
    const recoveryCode = input.recoveryCode?.replaceAll('-', '').toUpperCase();
    const recovery = recoveryCode
      ? await this.prisma.totpRecoveryCode.findFirst({
          where: {
            adminUserId: admin.id,
            codeHash: this.sessionHmac.digest(recoveryCode),
            usedAt: null,
          },
        })
      : null;
    if (!passwordValid || (!totpValid && !recovery)) {
      const failures = admin.failedLoginCount + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginCount: failures,
          lockedUntil:
            failures >= maximumLoginFailures ? new Date(now.getTime() + lockoutMilliseconds) : null,
        },
      });
      throw new UnauthorizedException('Invalid credentials.');
    }

    const sessionToken = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + idleSessionMilliseconds);
    const absoluteExpiresAt = new Date(now.getTime() + absoluteSessionMilliseconds);
    await this.prisma.$transaction(async (transaction) => {
      if (recovery) {
        const consumed = await transaction.totpRecoveryCode.updateMany({
          where: { id: recovery.id, usedAt: null },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new UnauthorizedException('Invalid credentials.');
      }
      const created = await transaction.adminSession.create({
        data: {
          adminUserId: admin.id,
          tokenHash: this.sessionHmac.digest(sessionToken),
          csrfTokenHash: this.sessionHmac.digest(csrfToken),
          lastSeenAt: now,
          expiresAt,
          absoluteExpiresAt,
          stepUpVerifiedAt: now,
          ipHmac: input.ip ? this.sessionHmac.digest(input.ip) : null,
          userAgentHash: input.userAgent
            ? createHash('sha256').update(input.userAgent).digest('hex')
            : null,
        },
      });
      await transaction.adminUser.update({
        where: { id: admin.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
      });
      await transaction.auditLog.create({
        data: {
          actorType: AuditActorType.ADMIN,
          actorId: admin.id,
          action: recovery ? 'admin.recovery_login' : 'admin.login',
          entityType: 'AdminSession',
          entityId: created.id,
          requestId: input.requestId,
          correlationId: input.requestId,
        },
      });
      if (recovery) {
        await transaction.outboxEvent.create({
          data: {
            topic: 'admin.notifications',
            aggregateType: 'AdminUser',
            aggregateId: admin.id,
            eventType: 'AdminRecoveryCodeUsed',
            payload: { adminUserId: admin.id },
          },
        });
      }
      return created;
    });

    return {
      sessionToken,
      csrfToken,
      expiresAt,
      admin: { id: admin.id, email: admin.email, role: admin.role },
    };
  }

  async authenticate(sessionToken: string): Promise<LoginResult['admin'] & { sessionId: string }> {
    const now = this.clock.now();
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: this.sessionHmac.digest(sessionToken) },
      include: { adminUser: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt <= now ||
      !session.adminUser.active
    ) {
      throw new UnauthorizedException('Authentication required.');
    }
    const refreshedExpiry = new Date(
      Math.min(now.getTime() + idleSessionMilliseconds, session.absoluteExpiresAt.getTime()),
    );
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: refreshedExpiry },
    });
    return {
      id: session.adminUser.id,
      email: session.adminUser.email,
      role: session.adminUser.role,
      sessionId: session.id,
    };
  }

  async logout(sessionToken: string, csrfToken: string): Promise<void> {
    const tokenHash = this.sessionHmac.digest(sessionToken);
    const session = await this.prisma.adminSession.findUnique({ where: { tokenHash } });
    if (!session || !this.sessionHmac.verify(csrfToken, session.csrfTokenHash)) {
      throw new UnauthorizedException('Invalid session.');
    }
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { revokedAt: this.clock.now() },
    });
  }

  async validateCsrf(sessionToken: string, csrfToken: string): Promise<void> {
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash: this.sessionHmac.digest(sessionToken) },
      select: { csrfTokenHash: true, revokedAt: true },
    });
    if (
      !session ||
      session.revokedAt ||
      !this.sessionHmac.verify(csrfToken, session.csrfTokenHash)
    ) {
      throw new UnauthorizedException('Invalid CSRF token.');
    }
  }

  async stepUp(sessionToken: string, totpCode: string): Promise<Date> {
    const tokenHash = this.sessionHmac.digest(sessionToken);
    const session = await this.prisma.adminSession.findUnique({
      where: { tokenHash },
      include: { adminUser: true },
    });
    const now = this.clock.now();
    if (!session || session.revokedAt || session.absoluteExpiresAt <= now) {
      throw new UnauthorizedException('Invalid session.');
    }
    const secret = this.decryptTotpSecret(session.adminUser);
    if (!secret || !verifyTotpCode(secret, totpCode, now)) {
      throw new UnauthorizedException('Invalid verification code.');
    }
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: { stepUpVerifiedAt: now },
    });
    return now;
  }

  private decryptTotpSecret(admin: {
    id: string;
    email: string;
    totpSecretEncrypted: Uint8Array | null;
    totpSecretKeyId: string | null;
  }): string | null {
    if (!admin.totpSecretEncrypted || !admin.totpSecretKeyId) return null;
    return this.encryption.decrypt(
      { ciphertext: Buffer.from(admin.totpSecretEncrypted), keyId: admin.totpSecretKeyId },
      `admin:${admin.email}:totp`,
    );
  }
}
