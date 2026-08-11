ALTER TYPE "LlmTask" ADD VALUE IF NOT EXISTS 'REFLECTION_TRANSCRIPTION';

CREATE TYPE "VoiceMediaStatus" AS ENUM (
  'RECEIVED',
  'STORED',
  'TRANSCRIBING',
  'TRANSCRIBED',
  'STORED_WITHOUT_AI',
  'TOO_LONG',
  'FAILED'
);

ALTER TABLE "practice_reflections"
  ALTER COLUMN "content_encrypted" DROP NOT NULL,
  ALTER COLUMN "content_key_id" DROP NOT NULL,
  ADD COLUMN "voice_media_id" UUID;

CREATE TABLE "voice_message_media" (
  "id" UUID NOT NULL,
  "inbox_event_id" UUID NOT NULL,
  "message_id" UUID,
  "student_id" UUID NOT NULL,
  "channel_identity_id" UUID NOT NULL,
  "status" "VoiceMediaStatus" NOT NULL DEFAULT 'RECEIVED',
  "storage_key" TEXT,
  "storage_encryption_key_id" TEXT,
  "content_type" TEXT,
  "byte_size" INTEGER,
  "duration_seconds" INTEGER,
  "original_file_name" TEXT,
  "transcription_model" TEXT,
  "transcribed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_message_media_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_message_media_inbox_event_id_key"
  ON "voice_message_media"("inbox_event_id");
CREATE UNIQUE INDEX "voice_message_media_message_id_key"
  ON "voice_message_media"("message_id");
CREATE INDEX "voice_message_media_student_id_created_at_idx"
  ON "voice_message_media"("student_id", "created_at");
CREATE INDEX "voice_message_media_status_created_at_idx"
  ON "voice_message_media"("status", "created_at");
CREATE UNIQUE INDEX "practice_reflections_voice_media_id_key"
  ON "practice_reflections"("voice_media_id");

ALTER TABLE "voice_message_media"
  ADD CONSTRAINT "voice_message_media_inbox_event_id_fkey"
  FOREIGN KEY ("inbox_event_id") REFERENCES "inbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_message_media_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_message_media_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "voice_message_media_channel_identity_id_fkey"
  FOREIGN KEY ("channel_identity_id") REFERENCES "student_channel_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_reflections"
  ADD CONSTRAINT "practice_reflections_voice_media_id_fkey"
  FOREIGN KEY ("voice_media_id") REFERENCES "voice_message_media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

