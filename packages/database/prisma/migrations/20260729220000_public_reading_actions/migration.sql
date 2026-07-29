ALTER TABLE "reading_public_visits"
  ADD COLUMN "pdf_download_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "whatsapp_click_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_pdf_downloaded_at" TIMESTAMP(3),
  ADD COLUMN "last_whatsapp_clicked_at" TIMESTAMP(3);
