import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FieldEncryption, type ApplicationConfig } from '@meditation/core';
import { AuditActorType, type Prisma } from '@meditation/database';
import { randomUUID } from 'node:crypto';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import { PrismaService } from '../database/prisma.service.js';

type StudentNoteWithAuthors = Prisma.StudentNoteGetPayload<{
  include: {
    createdByAdmin: { select: { email: true } };
    updatedByAdmin: { select: { email: true } };
  };
}>;

const noteAuthors = {
  createdByAdmin: { select: { email: true } },
  updatedByAdmin: { select: { email: true } },
} as const;

@Injectable()
export class StudentNoteService {
  private readonly encryption: FieldEncryption;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) config: ApplicationConfig,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID) {
      throw new Error('Student note encryption keys are required.');
    }
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, value]) => [id, Buffer.from(value, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
  }

  async list(studentId: string, adminId: string) {
    await this.requireStudent(studentId);
    const notes = await this.prisma.studentNote.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: noteAuthors,
    });
    await this.writeAudit({
      adminId,
      action: 'STUDENT_NOTES_SENSITIVE_READ',
      entityType: 'Student',
      entityId: studentId,
      safeDiff: { noteCount: notes.length },
      reason: 'Student notes read in admin portal',
    }).catch(() => undefined);
    return { items: notes.map((note) => this.present(note)) };
  }

  async create(studentId: string, adminId: string, content: string) {
    await this.requireStudent(studentId);
    const noteId = randomUUID();
    const encrypted = this.encryption.encrypt(content, this.associatedData(noteId));
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.studentNote.create({
        data: {
          id: noteId,
          studentId,
          contentEncrypted: new Uint8Array(encrypted.ciphertext),
          contentKeyId: encrypted.keyId,
          createdByAdminId: adminId,
          updatedByAdminId: adminId,
        },
        include: noteAuthors,
      });
      await tx.auditLog.create({
        data: this.auditData({
          adminId,
          action: 'STUDENT_NOTE_CREATED',
          entityType: 'StudentNote',
          entityId: noteId,
          safeDiff: { fields: ['content'], version: 1 },
          reason: 'Student note created in admin portal',
        }),
      });
      return created;
    });
    return this.present(note);
  }

  async update(
    studentId: string,
    noteId: string,
    adminId: string,
    content: string,
    version: number,
  ) {
    await this.requireNote(studentId, noteId);
    const encrypted = this.encryption.encrypt(content, this.associatedData(noteId));
    const note = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.studentNote.updateMany({
        where: { id: noteId, studentId, version },
        data: {
          contentEncrypted: new Uint8Array(encrypted.ciphertext),
          contentKeyId: encrypted.keyId,
          updatedByAdminId: adminId,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('Note was changed by another admin. Reload and try again.');
      }
      await tx.auditLog.create({
        data: this.auditData({
          adminId,
          action: 'STUDENT_NOTE_UPDATED',
          entityType: 'StudentNote',
          entityId: noteId,
          safeDiff: { fields: ['content'], fromVersion: version, toVersion: version + 1 },
          reason: 'Student note updated in admin portal',
        }),
      });
      return tx.studentNote.findUniqueOrThrow({
        where: { id: noteId },
        include: noteAuthors,
      });
    });
    return this.present(note);
  }

  async delete(studentId: string, noteId: string, adminId: string, version: number) {
    await this.requireNote(studentId, noteId);
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.studentNote.deleteMany({
        where: { id: noteId, studentId, version },
      });
      if (deleted.count !== 1) {
        throw new ConflictException('Note was changed by another admin. Reload and try again.');
      }
      await tx.auditLog.create({
        data: this.auditData({
          adminId,
          action: 'STUDENT_NOTE_DELETED',
          entityType: 'StudentNote',
          entityId: noteId,
          safeDiff: { deletedVersion: version },
          reason: 'Student note deleted in admin portal',
        }),
      });
    });
    return { id: noteId, deleted: true };
  }

  private async requireStudent(studentId: string) {
    const exists = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Student not found.');
  }

  private async requireNote(studentId: string, noteId: string) {
    const exists = await this.prisma.studentNote.findFirst({
      where: { id: noteId, studentId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Student note not found.');
  }

  private present(note: StudentNoteWithAuthors) {
    return {
      id: note.id,
      content: this.encryption.decrypt(
        { ciphertext: Buffer.from(note.contentEncrypted), keyId: note.contentKeyId },
        this.associatedData(note.id),
      ),
      version: note.version,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      createdBy: note.createdByAdmin.email,
      updatedBy: note.updatedByAdmin.email,
    };
  }

  private associatedData(noteId: string) {
    return `student-note:${noteId}:content`;
  }

  private writeAudit(input: AuditInput) {
    return this.prisma.auditLog.create({ data: this.auditData(input) });
  }

  private auditData(input: AuditInput) {
    return {
      actorType: AuditActorType.ADMIN,
      actorId: input.adminId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      safeDiff: input.safeDiff,
      reason: input.reason,
      requestId: randomUUID(),
      correlationId: randomUUID(),
    };
  }
}

type AuditInput = {
  adminId: string;
  action: string;
  entityType: string;
  entityId: string;
  safeDiff: Prisma.InputJsonValue;
  reason: string;
};
