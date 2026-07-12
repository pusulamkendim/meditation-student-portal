CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'DISCREPANCY', 'RECONNECT_REQUIRED', 'FAILED');
CREATE TYPE "ConferenceStatus" AS ENUM ('PENDING', 'READY', 'FAILED', 'MANUAL_OVERRIDE');
CREATE TYPE "MeetingScheduleAction" AS ENUM ('CREATED', 'RESCHEDULED', 'STATUS_CHANGED');
CREATE TYPE "SummarySource" AS ENUM ('DETERMINISTIC', 'AI_DRAFT');
CREATE TYPE "GoogleCalendarConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'RECONNECT_REQUIRED');
CREATE TYPE "CalendarDiscrepancyStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "meeting_credit_events"
  ADD COLUMN "idempotency_key" TEXT;
UPDATE "meeting_credit_events"
SET "idempotency_key" = 'legacy-credit-' || "id"::text
WHERE "idempotency_key" IS NULL;
ALTER TABLE "meeting_credit_events"
  ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "meeting_credit_events_idempotency_key_key"
  ON "meeting_credit_events"("idempotency_key");
CREATE INDEX "meeting_credit_events_meeting_id_created_at_idx"
  ON "meeting_credit_events"("meeting_id", "created_at");
ALTER TABLE "meeting_credit_events"
  ADD CONSTRAINT "meeting_credit_events_meeting_id_fkey"
  FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meeting_series"
  ADD COLUMN "google_calendar_id" TEXT,
  ADD COLUMN "google_etag" TEXT,
  ADD COLUMN "calendar_sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "conference_status" "ConferenceStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "meet_url_encrypted" BYTEA,
  ADD COLUMN "meet_url_key_id" TEXT,
  ADD COLUMN "last_calendar_sync_at" TIMESTAMP(3);

ALTER TABLE "weekly_meetings"
  ADD COLUMN "original_starts_at" TIMESTAMP(3),
  ADD COLUMN "google_etag" TEXT,
  ADD COLUMN "calendar_sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "last_calendar_sync_at" TIMESTAMP(3);

CREATE TABLE "meeting_schedule_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "meeting_series_id" UUID NOT NULL,
  "meeting_id" UUID,
  "action" "MeetingScheduleAction" NOT NULL,
  "previous_starts_at" TIMESTAMP(3),
  "new_starts_at" TIMESTAMP(3),
  "previous_status" "MeetingStatus",
  "new_status" "MeetingStatus",
  "reason" TEXT,
  "admin_user_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_schedule_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_schedule_events_idempotency_key_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "meeting_schedule_events_meeting_series_id_fkey"
    FOREIGN KEY ("meeting_series_id") REFERENCES "meeting_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "meeting_schedule_events_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "meeting_schedule_events_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "meeting_schedule_events_meeting_series_id_created_at_idx"
  ON "meeting_schedule_events"("meeting_series_id", "created_at");
CREATE INDEX "meeting_schedule_events_meeting_id_created_at_idx"
  ON "meeting_schedule_events"("meeting_id", "created_at");

CREATE TABLE "weekly_summaries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "meeting_id" UUID NOT NULL,
  "planned_practice_count" INTEGER NOT NULL DEFAULT 0,
  "completed_practice_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_practice_count" INTEGER NOT NULL DEFAULT 0,
  "missed_practice_count" INTEGER NOT NULL DEFAULT 0,
  "completion_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "highlights" JSONB NOT NULL,
  "source" "SummarySource" NOT NULL DEFAULT 'DETERMINISTIC',
  "generated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "weekly_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "weekly_summaries_meeting_id_key" UNIQUE ("meeting_id"),
  CONSTRAINT "weekly_summaries_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "coach_note_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "meeting_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coach_note_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "coach_note_versions_meeting_id_version_key" UNIQUE ("meeting_id", "version"),
  CONSTRAINT "coach_note_versions_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "coach_note_versions_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "coach_note_versions_meeting_id_created_at_idx"
  ON "coach_note_versions"("meeting_id", "created_at");

CREATE TABLE "google_calendar_integrations" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "status" "GoogleCalendarConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "refresh_token_encrypted" BYTEA,
  "refresh_token_key_id" TEXT,
  "calendar_id" TEXT,
  "calendar_name" TEXT,
  "last_successful_sync_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_calendar_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "google_oauth_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "state_hash" TEXT NOT NULL,
  "code_verifier_encrypted" BYTEA NOT NULL,
  "code_verifier_key_id" TEXT NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "google_oauth_states_state_hash_key" UNIQUE ("state_hash"),
  CONSTRAINT "google_oauth_states_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "google_oauth_states_expires_at_used_at_idx"
  ON "google_oauth_states"("expires_at", "used_at");

CREATE TABLE "google_calendar_sync_state" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "sync_token_encrypted" BYTEA,
  "sync_token_key_id" TEXT,
  "last_incremental_sync_at" TIMESTAMP(3),
  "last_full_sync_at" TIMESTAMP(3),
  "next_full_reconcile_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_calendar_sync_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_discrepancies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "meeting_series_id" UUID NOT NULL,
  "meeting_id" UUID,
  "type" TEXT NOT NULL,
  "status" "CalendarDiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
  "expected_starts_at" TIMESTAMP(3),
  "observed_starts_at" TIMESTAMP(3),
  "expected_etag" TEXT,
  "observed_etag" TEXT,
  "details" JSONB,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "calendar_discrepancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "calendar_discrepancies_meeting_series_id_fkey"
    FOREIGN KEY ("meeting_series_id") REFERENCES "meeting_series"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "calendar_discrepancies_meeting_id_fkey"
    FOREIGN KEY ("meeting_id") REFERENCES "weekly_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "calendar_discrepancies_status_created_at_idx"
  ON "calendar_discrepancies"("status", "created_at");
CREATE INDEX "calendar_discrepancies_meeting_series_id_created_at_idx"
  ON "calendar_discrepancies"("meeting_series_id", "created_at");
