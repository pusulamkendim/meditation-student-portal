-- CreateEnum
CREATE TYPE "MessageAudience" AS ENUM ('STUDENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "StandardMessageVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProviderTemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "ResponseOwner" AS ENUM ('SYSTEM_STANDARD_MESSAGE', 'AGENT_CONTEXTUAL', 'ADMIN_HANDOFF', 'NO_REPLY');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'TELEGRAM';

-- CreateTable
CREATE TABLE "system_event_definitions" (
    "key" TEXT NOT NULL,
    "audience" "MessageAudience" NOT NULL,
    "channels" JSONB NOT NULL,
    "variable_schema" JSONB NOT NULL,
    "compliance_class" TEXT NOT NULL,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "default_ttl_seconds" INTEGER NOT NULL,
    "registry_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_event_definitions_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "standard_messages" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" "MessageAudience" NOT NULL,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_message_variants" (
    "id" UUID NOT NULL,
    "standard_message_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "locale" TEXT NOT NULL,
    "curriculum_stage" "CurriculumStage",
    "slot" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "standard_message_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "standard_message_versions" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "placeholders" JSONB NOT NULL,
    "status" "StandardMessageVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "expert_approved" BOOLEAN NOT NULL DEFAULT false,
    "effective_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "standard_message_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_template_bindings" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "template_name" TEXT NOT NULL,
    "provider_locale" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ProviderTemplateStatus" NOT NULL,
    "provider_version" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_template_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_event_occurrences" (
    "id" UUID NOT NULL,
    "event_key" TEXT NOT NULL,
    "student_id" UUID,
    "inbound_message_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_event_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_response_ownership" (
    "id" UUID NOT NULL,
    "inbound_message_id" UUID NOT NULL,
    "owner" "ResponseOwner" NOT NULL,
    "reference_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbound_response_ownership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "standard_messages_event_key_audience_idx" ON "standard_messages"("event_key", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "standard_messages_event_key_name_key" ON "standard_messages"("event_key", "name");

-- CreateIndex
CREATE INDEX "standard_message_variants_channel_locale_curriculum_stage_s_idx" ON "standard_message_variants"("channel", "locale", "curriculum_stage", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "standard_message_variants_standard_message_id_channel_local_key" ON "standard_message_variants"("standard_message_id", "channel", "locale", "curriculum_stage", "slot", "priority");

-- CreateIndex
CREATE INDEX "standard_message_versions_variant_id_status_effective_at_idx" ON "standard_message_versions"("variant_id", "status", "effective_at");

-- CreateIndex
CREATE UNIQUE INDEX "standard_message_versions_variant_id_version_key" ON "standard_message_versions"("variant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "provider_template_bindings_variant_id_key" ON "provider_template_bindings"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_event_occurrences_inbound_message_id_key" ON "system_event_occurrences"("inbound_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_event_occurrences_idempotency_key_key" ON "system_event_occurrences"("idempotency_key");

-- CreateIndex
CREATE INDEX "system_event_occurrences_event_key_occurred_at_idx" ON "system_event_occurrences"("event_key", "occurred_at");

-- CreateIndex
CREATE INDEX "system_event_occurrences_student_id_occurred_at_idx" ON "system_event_occurrences"("student_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_response_ownership_inbound_message_id_key" ON "inbound_response_ownership"("inbound_message_id");

-- AddForeignKey
ALTER TABLE "standard_messages" ADD CONSTRAINT "standard_messages_event_key_fkey" FOREIGN KEY ("event_key") REFERENCES "system_event_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_message_variants" ADD CONSTRAINT "standard_message_variants_standard_message_id_fkey" FOREIGN KEY ("standard_message_id") REFERENCES "standard_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "standard_message_versions" ADD CONSTRAINT "standard_message_versions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "standard_message_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_template_bindings" ADD CONSTRAINT "provider_template_bindings_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "standard_message_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_event_occurrences" ADD CONSTRAINT "system_event_occurrences_event_key_fkey" FOREIGN KEY ("event_key") REFERENCES "system_event_definitions"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
