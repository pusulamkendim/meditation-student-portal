CREATE TYPE "MeditationGuidanceMode" AS ENUM ('SILENT', 'GUIDED');
CREATE TYPE "MeditationPublicShareStatus" AS ENUM ('ACTIVE', 'PAUSED');

ALTER TABLE "meditation_types"
ADD COLUMN "guidance_mode" "MeditationGuidanceMode" NOT NULL DEFAULT 'SILENT';

UPDATE "meditation_types"
SET "guidance_mode" = 'GUIDED'
WHERE "opening_audio_asset_id" IS NOT NULL;

CREATE TABLE "meditation_public_shares" (
    "id" UUID NOT NULL,
    "meditation_type_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "MeditationPublicShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowed_durations" INTEGER[] NOT NULL,
    "default_duration_minutes" INTEGER NOT NULL,
    "allow_duration_selection" BOOLEAN NOT NULL DEFAULT true,
    "allow_indexing" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_admin_id" UUID NOT NULL,
    "updated_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meditation_public_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "meditation_public_visits" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "visitor_hmac" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "start_count" INTEGER NOT NULL DEFAULT 0,
    "completion_count" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "first_opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_started_at" TIMESTAMP(3),
    "last_completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meditation_public_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "meditation_public_shares_meditation_type_id_key"
ON "meditation_public_shares"("meditation_type_id");
CREATE UNIQUE INDEX "meditation_public_shares_slug_key"
ON "meditation_public_shares"("slug");
CREATE INDEX "meditation_public_shares_status_updated_at_idx"
ON "meditation_public_shares"("status", "updated_at");
CREATE UNIQUE INDEX "meditation_public_visits_share_visitor_duration_key"
ON "meditation_public_visits"("share_id", "visitor_hmac", "duration_minutes");
CREATE INDEX "meditation_public_visits_share_id_last_seen_at_idx"
ON "meditation_public_visits"("share_id", "last_seen_at");
CREATE INDEX "meditation_public_visits_share_id_duration_minutes_idx"
ON "meditation_public_visits"("share_id", "duration_minutes");

ALTER TABLE "meditation_public_shares"
ADD CONSTRAINT "meditation_public_shares_meditation_type_id_fkey"
FOREIGN KEY ("meditation_type_id") REFERENCES "meditation_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meditation_public_shares"
ADD CONSTRAINT "meditation_public_shares_created_by_admin_id_fkey"
FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meditation_public_shares"
ADD CONSTRAINT "meditation_public_shares_updated_by_admin_id_fkey"
FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "meditation_public_visits"
ADD CONSTRAINT "meditation_public_visits_share_id_fkey"
FOREIGN KEY ("share_id") REFERENCES "meditation_public_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
