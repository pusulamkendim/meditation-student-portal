ALTER TYPE "PracticeSessionStatus" ADD VALUE IF NOT EXISTS 'REMINDED';
ALTER TYPE "PracticeSessionStatus" ADD VALUE IF NOT EXISTS 'AWAITING_RESPONSE';
ALTER TYPE "ConsentScope" ADD VALUE IF NOT EXISTS 'REFLECTION_STORAGE';

ALTER TABLE "practice_sessions"
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;

CREATE TABLE IF NOT EXISTS "practice_reflections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "practice_session_id" UUID NOT NULL,
  "content_encrypted" BYTEA NOT NULL,
  "content_key_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_reflections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "practice_reflections_practice_session_id_key" UNIQUE ("practice_session_id"),
  CONSTRAINT "practice_reflections_practice_session_id_fkey" FOREIGN KEY ("practice_session_id") REFERENCES "practice_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "practice_sessions_status_start_at_idx"
  ON "practice_sessions"("status", "start_at");
