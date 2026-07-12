import { z } from 'zod';
import {
  getStudentContextInputSchema,
  studentContextRangeSchema,
  studentContextSectionSchema,
  type GetStudentContextInput,
  type StudentContextRange,
  type StudentContextSection,
} from './llm.js';

export { getStudentContextInputSchema, studentContextRangeSchema, studentContextSectionSchema };
export type { GetStudentContextInput, StudentContextRange, StudentContextSection };

export const practiceContextSchema = z.object({
  asOf: z.string().datetime(),
  timezone: z.string(),
  package: z
    .object({ startDate: z.string(), endExclusive: z.string(), status: z.string() })
    .nullable(),
  plan: z
    .object({
      revision: z.number().int(),
      status: z.string(),
      slots: z.array(
        z.object({
          slot: z.string(),
          localTime: z.string(),
          durationMinutes: z.number().int(),
          active: z.boolean(),
        }),
      ),
    })
    .nullable(),
  sessions: z.array(
    z.object({
      serviceDate: z.string(),
      startAt: z.string().datetime(),
      slot: z.string().nullable(),
      durationMinutes: z.number().int(),
      status: z.string(),
    }),
  ),
  totals: z.object({
    planned: z.number(),
    completed: z.number(),
    skipped: z.number(),
    missed: z.number(),
    completionRate: z.number(),
  }),
  nextPractice: z
    .object({
      startAt: z.string().datetime(),
      slot: z.string().nullable(),
      durationMinutes: z.number(),
    })
    .nullable(),
  nextCursor: z.string().nullable(),
});

export const studentContextResponseSchema = z.object({
  schemaVersion: z.literal('student-context-v1'),
  asOf: z.string().datetime(),
  range: studentContextRangeSchema,
  sections: z.record(studentContextSectionSchema, z.unknown()),
  recordHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  nextCursor: z.string().nullable(),
});
