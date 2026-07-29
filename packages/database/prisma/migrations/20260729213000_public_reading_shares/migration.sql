CREATE TYPE "ReadingPublicShareStatus" AS ENUM ('ACTIVE', 'PAUSED');

CREATE TABLE "reading_public_shares" (
    "id" UUID NOT NULL,
    "reading_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "ReadingPublicShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "allow_pdf" BOOLEAN NOT NULL DEFAULT false,
    "allow_indexing" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_admin_id" UUID NOT NULL,
    "updated_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_public_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reading_public_visits" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "visitor_hmac" TEXT NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 1,
    "max_section_position" INTEGER NOT NULL DEFAULT 1,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "first_opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reading_public_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reading_public_shares_reading_id_key"
  ON "reading_public_shares"("reading_id");
CREATE UNIQUE INDEX "reading_public_shares_slug_key"
  ON "reading_public_shares"("slug");
CREATE INDEX "reading_public_shares_status_updated_at_idx"
  ON "reading_public_shares"("status", "updated_at");
CREATE UNIQUE INDEX "reading_public_visits_share_id_visitor_hmac_key"
  ON "reading_public_visits"("share_id", "visitor_hmac");
CREATE INDEX "reading_public_visits_share_id_last_seen_at_idx"
  ON "reading_public_visits"("share_id", "last_seen_at");
CREATE INDEX "reading_public_visits_share_id_completed_at_idx"
  ON "reading_public_visits"("share_id", "completed_at");

ALTER TABLE "reading_public_shares" ADD CONSTRAINT "reading_public_shares_reading_id_fkey"
  FOREIGN KEY ("reading_id") REFERENCES "readings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reading_public_shares" ADD CONSTRAINT "reading_public_shares_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reading_public_shares" ADD CONSTRAINT "reading_public_shares_updated_by_admin_id_fkey"
  FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reading_public_visits" ADD CONSTRAINT "reading_public_visits_share_id_fkey"
  FOREIGN KEY ("share_id") REFERENCES "reading_public_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
