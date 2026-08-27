ALTER TABLE "readings"
  ADD COLUMN "cover_image_storage_key" TEXT,
  ADD COLUMN "cover_image_mime_type" TEXT,
  ADD COLUMN "cover_image_alt" TEXT,
  ADD COLUMN "cover_image_byte_size" INTEGER,
  ADD COLUMN "cover_image_hash" TEXT;

ALTER TABLE "meditation_types"
  ADD COLUMN "cover_image_storage_key" TEXT,
  ADD COLUMN "cover_image_mime_type" TEXT,
  ADD COLUMN "cover_image_alt" TEXT,
  ADD COLUMN "cover_image_byte_size" INTEGER,
  ADD COLUMN "cover_image_hash" TEXT;
