CREATE TABLE "drawings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storage_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "element_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_admin_id" UUID NOT NULL,
    "updated_by_admin_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "drawings_updated_at_idx" ON "drawings"("updated_at");

ALTER TABLE "drawings"
ADD CONSTRAINT "drawings_created_by_admin_id_fkey"
FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drawings"
ADD CONSTRAINT "drawings_updated_by_admin_id_fkey"
FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
