CREATE TYPE "ReadingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "ReadingAssignmentStatus" AS ENUM ('ASSIGNED', 'OPENED', 'COMPLETED');

CREATE TABLE "readings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "author" TEXT,
    "estimated_minutes" INTEGER NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'DRAFT',
    "allow_agent" BOOLEAN NOT NULL DEFAULT false,
    "source_filename" TEXT NOT NULL,
    "source_storage_key" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "source_byte_size" INTEGER NOT NULL,
    "pdf_filename" TEXT,
    "pdf_storage_key" TEXT,
    "pdf_hash" TEXT,
    "pdf_byte_size" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_admin_id" UUID NOT NULL,
    "updated_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "readings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reading_sections" (
    "id" UUID NOT NULL,
    "reading_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content_markdown" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reading_assignments" (
    "id" UUID NOT NULL,
    "reading_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assigned_by_admin_id" UUID NOT NULL,
    "access_token_hmac" TEXT NOT NULL,
    "status" "ReadingAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "last_section_position" INTEGER NOT NULL DEFAULT 1,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "response_encrypted" BYTEA,
    "response_key_id" TEXT,
    "message_intent_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "readings_status_updated_at_idx" ON "readings"("status", "updated_at");
CREATE UNIQUE INDEX "reading_sections_reading_id_position_key" ON "reading_sections"("reading_id", "position");
CREATE INDEX "reading_sections_reading_id_idx" ON "reading_sections"("reading_id");
CREATE UNIQUE INDEX "reading_assignments_access_token_hmac_key" ON "reading_assignments"("access_token_hmac");
CREATE UNIQUE INDEX "reading_assignments_message_intent_id_key" ON "reading_assignments"("message_intent_id");
CREATE UNIQUE INDEX "reading_assignments_reading_id_student_id_key" ON "reading_assignments"("reading_id", "student_id");
CREATE INDEX "reading_assignments_student_id_status_idx" ON "reading_assignments"("student_id", "status");
CREATE INDEX "reading_assignments_reading_id_status_idx" ON "reading_assignments"("reading_id", "status");

ALTER TABLE "readings" ADD CONSTRAINT "readings_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "readings" ADD CONSTRAINT "readings_updated_by_admin_id_fkey"
  FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reading_sections" ADD CONSTRAINT "reading_sections_reading_id_fkey"
  FOREIGN KEY ("reading_id") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reading_assignments" ADD CONSTRAINT "reading_assignments_reading_id_fkey"
  FOREIGN KEY ("reading_id") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reading_assignments" ADD CONSTRAINT "reading_assignments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reading_assignments" ADD CONSTRAINT "reading_assignments_assigned_by_admin_id_fkey"
  FOREIGN KEY ("assigned_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reading_assignments" ADD CONSTRAINT "reading_assignments_message_intent_id_fkey"
  FOREIGN KEY ("message_intent_id") REFERENCES "message_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
