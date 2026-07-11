-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('LEAD', 'PAYMENT_PENDING', 'ACTIVE', 'INACTIVE', 'PAUSED', 'DELETION_PENDING', 'DELETED');

-- CreateEnum
CREATE TYPE "CurriculumStage" AS ENUM ('WEEK_1', 'WEEK_2', 'WEEK_3', 'WEEK_4', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "StageSource" AS ENUM ('AUTO', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "ChannelIdentityStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('MESSAGING', 'AGENT_REPLY_AI', 'REFLECTION_AI');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REPORTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PracticePlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'PAUSED');

-- CreateEnum
CREATE TYPE "PracticeSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'MISSED', 'CANCELLED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageIntentStatus" AS ENUM ('PENDING', 'CLAIMED', 'SENT', 'DELIVERY_UNKNOWN', 'DELIVERED', 'READ', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'ASSISTANT', 'FINANCE');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('ADMIN', 'STUDENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'ADMIN_PANEL');

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "status" "StudentStatus" NOT NULL DEFAULT 'LEAD',
    "full_name_encrypted" BYTEA,
    "full_name_key_id" TEXT,
    "phone_encrypted" BYTEA,
    "phone_key_id" TEXT,
    "phone_hmac" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "preferred_locale" TEXT NOT NULL DEFAULT 'tr-TR',
    "curriculum_stage" "CurriculumStage" NOT NULL DEFAULT 'WEEK_1',
    "curriculum_stage_source" "StageSource" NOT NULL DEFAULT 'AUTO',
    "default_channel_identity_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_status_history" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "from" "StudentStatus",
    "to" "StudentStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_notice_receipts" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "notice_version" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL,
    "external_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_notice_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "text_version" TEXT NOT NULL,
    "channel" "ChannelType" NOT NULL,
    "external_message_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging_preferences" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "proactive_enabled" BOOLEAN NOT NULL DEFAULT true,
    "paused_at" TIMESTAMP(3),
    "pause_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messaging_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" UUID NOT NULL,
    "type" "ChannelType" NOT NULL,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_channel_identities" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "channel_account_id" UUID NOT NULL,
    "external_user_encrypted" BYTEA NOT NULL,
    "external_user_key_id" TEXT NOT NULL,
    "external_user_hmac" TEXT NOT NULL,
    "status" "ChannelIdentityStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_channel_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'REPORTED',
    "amount_minor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "reference_code" TEXT NOT NULL,
    "proof_storage_key" TEXT,
    "proof_delete_after" TIMESTAMP(3),
    "reported_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "approved_by_admin_user_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_periods" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "payment_id" UUID,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "start_date" DATE NOT NULL,
    "end_exclusive" DATE NOT NULL,
    "price_minor" BIGINT NOT NULL DEFAULT 400000,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_credit_events" (
    "id" UUID NOT NULL,
    "subscription_period_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "meeting_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_credit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_plans" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subscription_period_id" UUID NOT NULL,
    "status" "PracticePlanStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_until" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_slots" (
    "id" UUID NOT NULL,
    "practice_plan_id" UUID NOT NULL,
    "slot_key" TEXT NOT NULL,
    "local_time" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "practice_plan_id" UUID NOT NULL,
    "practice_slot_id" UUID,
    "service_date" DATE NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "PracticeSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reply_nonce_hmac" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_series" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subscription_period_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL,
    "recurrence_rule" TEXT NOT NULL,
    "google_series_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_meetings" (
    "id" UUID NOT NULL,
    "meeting_series_id" UUID NOT NULL,
    "occurrence_number" INTEGER NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "google_instance_id" TEXT,
    "meet_url_encrypted" BYTEA,
    "meet_url_key_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "channel_identity_id" UUID NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "external_message_id" TEXT,
    "content_encrypted" BYTEA,
    "content_key_id" TEXT,
    "content_hmac" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_intents" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "channel_identity_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "status" "MessageIntentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "suppression_reason" TEXT,
    "provider_request_id" TEXT,
    "provider_message_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_events" (
    "id" UUID NOT NULL,
    "student_id" UUID,
    "channel" "ChannelType" NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'ADMIN',
    "totp_secret_encrypted" BYTEA,
    "totp_secret_key_id" TEXT,
    "totp_enabled_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "absolute_expires_at" TIMESTAMP(3) NOT NULL,
    "step_up_verified_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "ip_hmac" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "totp_recovery_codes" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "totp_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "safe_diff" JSONB,
    "reason" TEXT,
    "request_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "ip_hmac" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "event_type" TEXT NOT NULL,
    "recipient_hmac" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_phone_hmac_key" ON "students"("phone_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "students_default_channel_identity_id_key" ON "students"("default_channel_identity_id");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "student_status_history_student_id_created_at_idx" ON "student_status_history"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_notice_receipts_student_id_notice_version_channel_key" ON "privacy_notice_receipts"("student_id", "notice_version", "channel");

-- CreateIndex
CREATE INDEX "consents_student_id_scope_occurred_at_idx" ON "consents"("student_id", "scope", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "messaging_preferences_student_id_key" ON "messaging_preferences"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_type_external_id_key" ON "channel_accounts"("type", "external_id");

-- CreateIndex
CREATE INDEX "student_channel_identities_student_id_status_idx" ON "student_channel_identities"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_channel_identities_channel_account_id_external_user_key" ON "student_channel_identities"("channel_account_id", "external_user_hmac");

-- CreateIndex
CREATE UNIQUE INDEX "payments_reference_code_key" ON "payments"("reference_code");

-- CreateIndex
CREATE INDEX "payments_student_id_status_idx" ON "payments"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_periods_payment_id_key" ON "subscription_periods"("payment_id");

-- CreateIndex
CREATE INDEX "subscription_periods_student_id_status_idx" ON "subscription_periods"("student_id", "status");

-- CreateIndex
CREATE INDEX "meeting_credit_events_subscription_period_id_created_at_idx" ON "meeting_credit_events"("subscription_period_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_plans_student_id_status_idx" ON "practice_plans"("student_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "practice_plans_student_id_revision_key" ON "practice_plans"("student_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "practice_slots_practice_plan_id_slot_key_key" ON "practice_slots"("practice_plan_id", "slot_key");

-- CreateIndex
CREATE INDEX "practice_sessions_student_id_start_at_idx" ON "practice_sessions"("student_id", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "practice_sessions_practice_plan_id_service_date_practice_sl_key" ON "practice_sessions"("practice_plan_id", "service_date", "practice_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_series_subscription_period_id_key" ON "meeting_series"("subscription_period_id");

-- CreateIndex
CREATE INDEX "weekly_meetings_starts_at_status_idx" ON "weekly_meetings"("starts_at", "status");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_meetings_meeting_series_id_occurrence_number_key" ON "weekly_meetings"("meeting_series_id", "occurrence_number");

-- CreateIndex
CREATE INDEX "messages_student_id_occurred_at_idx" ON "messages"("student_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_channel_identity_id_external_message_id_key" ON "messages"("channel_identity_id", "external_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_intents_idempotency_key_key" ON "message_intents"("idempotency_key");

-- CreateIndex
CREATE INDEX "message_intents_status_due_at_idx" ON "message_intents"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_events_dedupe_key_key" ON "inbox_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "inbox_events_student_id_created_at_idx" ON "inbox_events"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_expires_at_idx" ON "admin_sessions"("admin_user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "totp_recovery_codes_code_hash_key" ON "totp_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_type_actor_id_created_at_idx" ON "audit_logs"("actor_type", "actor_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_created_at_idx" ON "notification_deliveries"("status", "created_at");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_default_channel_identity_id_fkey" FOREIGN KEY ("default_channel_identity_id") REFERENCES "student_channel_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_status_history" ADD CONSTRAINT "student_status_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_notice_receipts" ADD CONSTRAINT "privacy_notice_receipts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging_preferences" ADD CONSTRAINT "messaging_preferences_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_channel_identities" ADD CONSTRAINT "student_channel_identities_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_channel_identities" ADD CONSTRAINT "student_channel_identities_channel_account_id_fkey" FOREIGN KEY ("channel_account_id") REFERENCES "channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_admin_user_id_fkey" FOREIGN KEY ("approved_by_admin_user_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_periods" ADD CONSTRAINT "subscription_periods_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_credit_events" ADD CONSTRAINT "meeting_credit_events_subscription_period_id_fkey" FOREIGN KEY ("subscription_period_id") REFERENCES "subscription_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_plans" ADD CONSTRAINT "practice_plans_subscription_period_id_fkey" FOREIGN KEY ("subscription_period_id") REFERENCES "subscription_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_slots" ADD CONSTRAINT "practice_slots_practice_plan_id_fkey" FOREIGN KEY ("practice_plan_id") REFERENCES "practice_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_practice_plan_id_fkey" FOREIGN KEY ("practice_plan_id") REFERENCES "practice_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_practice_slot_id_fkey" FOREIGN KEY ("practice_slot_id") REFERENCES "practice_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_series" ADD CONSTRAINT "meeting_series_subscription_period_id_fkey" FOREIGN KEY ("subscription_period_id") REFERENCES "subscription_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_meetings" ADD CONSTRAINT "weekly_meetings_meeting_series_id_fkey" FOREIGN KEY ("meeting_series_id") REFERENCES "meeting_series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_identity_id_fkey" FOREIGN KEY ("channel_identity_id") REFERENCES "student_channel_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_intents" ADD CONSTRAINT "message_intents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_intents" ADD CONSTRAINT "message_intents_channel_identity_id_fkey" FOREIGN KEY ("channel_identity_id") REFERENCES "student_channel_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants not expressible in the Prisma schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "subscription_periods"
  ADD CONSTRAINT "subscription_period_dates_valid" CHECK ("end_exclusive" > "start_date"),
  ADD CONSTRAINT "subscription_period_price_positive" CHECK ("price_minor" > 0),
  ADD CONSTRAINT "subscription_period_version_positive" CHECK ("version" > 0);

ALTER TABLE "subscription_periods"
  ADD CONSTRAINT "subscription_period_no_active_overlap"
  EXCLUDE USING gist (
    "student_id" WITH =,
    daterange("start_date", "end_exclusive", '[)') WITH &&
  ) WHERE ("status" IN ('SCHEDULED', 'ACTIVE'));

ALTER TABLE "payments"
  ADD CONSTRAINT "payment_amount_positive" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "payment_version_positive" CHECK ("version" > 0);

ALTER TABLE "practice_slots"
  ADD CONSTRAINT "practice_slot_duration_valid" CHECK ("duration_minutes" BETWEEN 1 AND 180);

ALTER TABLE "practice_sessions"
  ADD CONSTRAINT "practice_session_duration_valid" CHECK ("duration_minutes" BETWEEN 1 AND 180),
  ADD CONSTRAINT "practice_session_version_positive" CHECK ("version" > 0);

ALTER TABLE "weekly_meetings"
  ADD CONSTRAINT "weekly_meeting_occurrence_valid" CHECK ("occurrence_number" BETWEEN 1 AND 4),
  ADD CONSTRAINT "weekly_meeting_time_valid" CHECK ("ends_at" > "starts_at"),
  ADD CONSTRAINT "weekly_meeting_version_positive" CHECK ("version" > 0);

ALTER TABLE "message_intents"
  ADD CONSTRAINT "message_intent_window_valid" CHECK ("expires_at" > "due_at");

ALTER TABLE "students"
  ADD CONSTRAINT "student_version_positive" CHECK ("version" > 0);

CREATE FUNCTION enforce_student_default_channel_identity() RETURNS trigger AS $$
BEGIN
  IF NEW.default_channel_identity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM student_channel_identities identity
    WHERE identity.id = NEW.default_channel_identity_id
      AND identity.student_id = NEW.id
      AND identity.status IN ('VERIFIED', 'ACTIVE')
  ) THEN
    RAISE EXCEPTION 'default channel identity must be verified and belong to the student';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "students_default_channel_identity_guard"
BEFORE INSERT OR UPDATE OF "default_channel_identity_id" ON "students"
FOR EACH ROW EXECUTE FUNCTION enforce_student_default_channel_identity();

CREATE TABLE "feature_flag_configs" (
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
  "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
  "subject_ids" JSONB,
  "version" INTEGER NOT NULL DEFAULT 1,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_flag_configs_pkey" PRIMARY KEY ("key"),
  CONSTRAINT "feature_flag_rollout_valid" CHECK ("rollout_percentage" BETWEEN 0 AND 100),
  CONSTRAINT "feature_flag_scope_valid" CHECK ("scope" IN ('GLOBAL', 'CHANNEL', 'COHORT', 'STUDENT')),
  CONSTRAINT "feature_flag_version_positive" CHECK ("version" > 0)
);

CREATE TABLE "feature_flag_evaluations" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "subject_hmac" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "config_version" INTEGER NOT NULL,
  "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "feature_flag_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feature_flag_evaluations_key_evaluated_at_idx"
ON "feature_flag_evaluations"("key", "evaluated_at");
