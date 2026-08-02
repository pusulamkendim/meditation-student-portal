CREATE TYPE "MeditationLevel" AS ENUM ('INTRODUCTION', 'INTERMEDIATE', 'ADVANCED');
CREATE TYPE "MeditationTypeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "MeditationAudioKind" AS ENUM ('OPENING', 'CLOSING');
CREATE TYPE "MeditationRenderStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE "meditation_types" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "level" "MeditationLevel" NOT NULL DEFAULT 'INTRODUCTION',
    "status" "MeditationTypeStatus" NOT NULL DEFAULT 'DRAFT',
    "target_durations" INTEGER[] NOT NULL DEFAULT ARRAY[15, 20, 25, 30],
    "opening_audio_asset_id" UUID,
    "closing_audio_asset_id" UUID,
    "audio_revision" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_admin_id" UUID NOT NULL,
    "updated_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meditation_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meditation_audio_assets" (
    "id" UUID NOT NULL,
    "meditation_type_id" UUID NOT NULL,
    "kind" "MeditationAudioKind" NOT NULL,
    "version" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "created_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "meditation_audio_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meditation_audio_renders" (
    "id" UUID NOT NULL,
    "meditation_type_id" UUID NOT NULL,
    "source_version" INTEGER NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "status" "MeditationRenderStatus" NOT NULL DEFAULT 'PENDING',
    "opening_audio_asset_id" UUID NOT NULL,
    "closing_audio_asset_id" UUID,
    "storage_key" TEXT,
    "content_type" TEXT,
    "byte_size" INTEGER,
    "content_hash" TEXT,
    "actual_duration_seconds" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "rendered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meditation_audio_renders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "practice_slots"
    ADD COLUMN "meditation_type_id" UUID;

ALTER TABLE "practice_sessions"
    ADD COLUMN "meditation_type_id" UUID,
    ADD COLUMN "meditation_render_id" UUID;

CREATE INDEX "meditation_types_status_level_updated_at_idx"
    ON "meditation_types"("status", "level", "updated_at");
CREATE UNIQUE INDEX "meditation_audio_assets_meditation_type_id_kind_version_key"
    ON "meditation_audio_assets"("meditation_type_id", "kind", "version");
CREATE INDEX "meditation_audio_assets_meditation_type_id_kind_created_at_idx"
    ON "meditation_audio_assets"("meditation_type_id", "kind", "created_at");
CREATE UNIQUE INDEX "meditation_audio_renders_meditation_type_id_source_version_duration_minutes_key"
    ON "meditation_audio_renders"("meditation_type_id", "source_version", "duration_minutes");
CREATE INDEX "meditation_audio_renders_status_created_at_idx"
    ON "meditation_audio_renders"("status", "created_at");
CREATE INDEX "meditation_audio_renders_meditation_type_id_duration_minutes_status_idx"
    ON "meditation_audio_renders"("meditation_type_id", "duration_minutes", "status");

ALTER TABLE "meditation_types"
    ADD CONSTRAINT "meditation_types_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "meditation_types_updated_by_admin_id_fkey"
    FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meditation_audio_assets"
    ADD CONSTRAINT "meditation_audio_assets_meditation_type_id_fkey"
    FOREIGN KEY ("meditation_type_id") REFERENCES "meditation_types"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "meditation_audio_assets_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meditation_types"
    ADD CONSTRAINT "meditation_types_opening_audio_asset_id_fkey"
    FOREIGN KEY ("opening_audio_asset_id") REFERENCES "meditation_audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "meditation_types_closing_audio_asset_id_fkey"
    FOREIGN KEY ("closing_audio_asset_id") REFERENCES "meditation_audio_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "meditation_audio_renders"
    ADD CONSTRAINT "meditation_audio_renders_meditation_type_id_fkey"
    FOREIGN KEY ("meditation_type_id") REFERENCES "meditation_types"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "meditation_audio_renders_opening_audio_asset_id_fkey"
    FOREIGN KEY ("opening_audio_asset_id") REFERENCES "meditation_audio_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "meditation_audio_renders_closing_audio_asset_id_fkey"
    FOREIGN KEY ("closing_audio_asset_id") REFERENCES "meditation_audio_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "practice_slots"
    ADD CONSTRAINT "practice_slots_meditation_type_id_fkey"
    FOREIGN KEY ("meditation_type_id") REFERENCES "meditation_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "practice_sessions"
    ADD CONSTRAINT "practice_sessions_meditation_type_id_fkey"
    FOREIGN KEY ("meditation_type_id") REFERENCES "meditation_types"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "practice_sessions_meditation_render_id_fkey"
    FOREIGN KEY ("meditation_render_id") REFERENCES "meditation_audio_renders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
