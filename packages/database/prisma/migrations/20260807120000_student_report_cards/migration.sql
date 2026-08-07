ALTER TYPE "LlmTask" ADD VALUE IF NOT EXISTS 'STUDENT_REPORT';

CREATE TYPE "StudentReportType" AS ENUM ('WEEKLY', 'MONTHLY');
CREATE TYPE "StudentReportStatus" AS ENUM ('DRAFT', 'APPROVED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "StudentReportAiStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'READY', 'FAILED');
CREATE TYPE "StudentReportShareStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "student_report_cards" (
  "id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "type" "StudentReportType" NOT NULL DEFAULT 'WEEKLY',
  "period_start" DATE NOT NULL,
  "period_end_exclusive" DATE NOT NULL,
  "status" "StudentReportStatus" NOT NULL DEFAULT 'DRAFT',
  "ai_status" "StudentReportAiStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "snapshot" JSONB NOT NULL,
  "content_encrypted" BYTEA NOT NULL,
  "content_key_id" TEXT NOT NULL,
  "featured_reflection_id" UUID,
  "input_hash" TEXT NOT NULL,
  "model_ref" TEXT,
  "operation_id" TEXT,
  "prompt_version_id" UUID,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_admin_id" UUID NOT NULL,
  "approved_by_admin_id" UUID,
  "approved_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_report_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_report_shares" (
  "id" UUID NOT NULL,
  "report_id" UUID NOT NULL,
  "token_hmac" TEXT NOT NULL,
  "status" "StudentReportShareStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMP(3),
  "view_count" INTEGER NOT NULL DEFAULT 0,
  "first_opened_at" TIMESTAMP(3),
  "last_opened_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_report_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_report_cards_operation_id_key" ON "student_report_cards"("operation_id");
CREATE INDEX "student_report_cards_student_id_period_start_period_end_exclusive_idx" ON "student_report_cards"("student_id", "period_start", "period_end_exclusive");
CREATE INDEX "student_report_cards_status_updated_at_idx" ON "student_report_cards"("status", "updated_at");
CREATE UNIQUE INDEX "student_report_shares_report_id_key" ON "student_report_shares"("report_id");
CREATE UNIQUE INDEX "student_report_shares_token_hmac_key" ON "student_report_shares"("token_hmac");
CREATE INDEX "student_report_shares_status_expires_at_idx" ON "student_report_shares"("status", "expires_at");

ALTER TABLE "student_report_cards" ADD CONSTRAINT "student_report_cards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_report_cards" ADD CONSTRAINT "student_report_cards_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_report_cards" ADD CONSTRAINT "student_report_cards_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_report_shares" ADD CONSTRAINT "student_report_shares_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "student_report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_report_shares" ADD CONSTRAINT "student_report_shares_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "feature_flag_configs" ("key", "enabled", "rollout_percentage", "scope", "version", "updated_at")
VALUES ('llm.student-report.enabled', true, 100, 'GLOBAL', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
