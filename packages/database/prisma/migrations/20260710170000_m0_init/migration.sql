CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "system_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
