import type { ApplicationConfig } from '@meditation/core';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../database/prisma.service.js';
import { StudentNoteService } from './student-note.service.js';

const studentId = '11111111-1111-4111-8111-111111111111';
const adminId = '22222222-2222-4222-8222-222222222222';
const adminEmail = 'admin@example.com';

function createHarness() {
  const notes = new Map<string, Record<string, unknown>>();
  const audits: Array<Record<string, unknown>> = [];
  const now = new Date('2026-07-24T10:00:00.000Z');

  const studentNote = {
    findMany: vi.fn(async () => [...notes.values()]),
    findFirst: vi.fn(async ({ where }: { where: { id: string; studentId: string } }) => {
      const note = notes.get(where.id);
      return note && note.studentId === where.studentId ? { id: note.id } : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const note = {
        ...data,
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdByAdmin: { email: adminEmail },
        updatedByAdmin: { email: adminEmail },
      };
      notes.set(data.id as string, note);
      return note;
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; studentId: string; version: number };
        data: Record<string, unknown>;
      }) => {
        const note = notes.get(where.id);
        if (!note || note.studentId !== where.studentId || note.version !== where.version) {
          return { count: 0 };
        }
        Object.assign(note, data, {
          version: where.version + 1,
          updatedAt: new Date(now.getTime() + 60_000),
          updatedByAdmin: { email: adminEmail },
        });
        return { count: 1 };
      },
    ),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const note = notes.get(where.id);
      if (!note) throw new Error('not found');
      return note;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string; version: number } }) => {
      const note = notes.get(where.id);
      if (!note || note.version !== where.version) return { count: 0 };
      notes.delete(where.id);
      return { count: 1 };
    }),
  };
  const prisma = {
    student: { findUnique: vi.fn(async () => ({ id: studentId })) },
    studentNote,
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
  };
  const config = {
    DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({
      test: Buffer.alloc(32, 7).toString('base64'),
    }),
    ACTIVE_DATA_KEY_ID: 'test',
  } as ApplicationConfig;
  const service = new StudentNoteService(prisma as unknown as PrismaService, config);
  return { service, notes, audits, studentNote };
}

describe('StudentNoteService', () => {
  it('encrypts notes at rest and supports the complete admin lifecycle', async () => {
    const { service, notes, audits } = createHarness();

    const created = await service.create(studentId, adminId, 'İlk takip notu');
    expect(created.content).toBe('İlk takip notu');
    const stored = notes.get(created.id)!;
    expect(Buffer.from(stored.contentEncrypted as Uint8Array).toString('utf8')).not.toContain(
      'İlk takip notu',
    );

    const listed = await service.list(studentId, adminId);
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.content).toBe('İlk takip notu');

    const updated = await service.update(
      studentId,
      created.id,
      adminId,
      'Güncellenmiş takip notu',
      created.version,
    );
    expect(updated).toMatchObject({ content: 'Güncellenmiş takip notu', version: 2 });

    await expect(service.delete(studentId, created.id, adminId, updated.version)).resolves.toEqual({
      id: created.id,
      deleted: true,
    });
    expect(notes.size).toBe(0);
    expect(audits.map((item) => item.action)).toEqual([
      'STUDENT_NOTE_CREATED',
      'STUDENT_NOTES_SENSITIVE_READ',
      'STUDENT_NOTE_UPDATED',
      'STUDENT_NOTE_DELETED',
    ]);
  });

  it('rejects an update made with a stale version', async () => {
    const { service, studentNote } = createHarness();
    const created = await service.create(studentId, adminId, 'Not');
    studentNote.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.update(studentId, created.id, adminId, 'Çakışan not', created.version),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
