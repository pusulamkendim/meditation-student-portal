ALTER TABLE "meditation_public_visits"
ADD COLUMN "cta_view_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "cta_click_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_cta_viewed_at" TIMESTAMP(3),
ADD COLUMN "last_cta_clicked_at" TIMESTAMP(3);
