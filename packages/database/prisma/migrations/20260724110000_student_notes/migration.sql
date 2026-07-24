CREATE TABLE "student_notes" (
  "id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "content_encrypted" BYTEA NOT NULL,
  "content_key_id" TEXT NOT NULL,
  "created_by_admin_id" UUID NOT NULL,
  "updated_by_admin_id" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "student_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "student_notes_student_id_created_at_idx"
  ON "student_notes"("student_id", "created_at");

ALTER TABLE "student_notes"
  ADD CONSTRAINT "student_notes_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_notes"
  ADD CONSTRAINT "student_notes_created_by_admin_id_fkey"
  FOREIGN KEY ("created_by_admin_id") REFERENCES "admin_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_notes"
  ADD CONSTRAINT "student_notes_updated_by_admin_id_fkey"
  FOREIGN KEY ("updated_by_admin_id") REFERENCES "admin_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
