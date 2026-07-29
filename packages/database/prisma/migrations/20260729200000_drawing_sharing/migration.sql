CREATE TYPE "DrawingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "DrawingAssignmentStatus" AS ENUM ('SHARED', 'OPENED', 'REVOKED');

ALTER TABLE "drawings"
ADD COLUMN "status" "DrawingStatus" NOT NULL DEFAULT 'DRAFT';

DROP INDEX "drawings_updated_at_idx";

CREATE INDEX "drawings_status_updated_at_idx" ON "drawings"("status", "updated_at");

CREATE TABLE "drawing_assignments" (
    "id" UUID NOT NULL,
    "drawing_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "assigned_by_admin_id" UUID NOT NULL,
    "access_token_hmac" TEXT NOT NULL,
    "status" "DrawingAssignmentStatus" NOT NULL DEFAULT 'SHARED',
    "shared_version" INTEGER NOT NULL,
    "message_intent_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_opened_at" TIMESTAMP(3),
    "last_opened_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drawing_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "drawing_assignments_access_token_hmac_key"
ON "drawing_assignments"("access_token_hmac");

CREATE UNIQUE INDEX "drawing_assignments_message_intent_id_key"
ON "drawing_assignments"("message_intent_id");

CREATE UNIQUE INDEX "drawing_assignments_drawing_id_student_id_key"
ON "drawing_assignments"("drawing_id", "student_id");

CREATE INDEX "drawing_assignments_student_id_status_idx"
ON "drawing_assignments"("student_id", "status");

CREATE INDEX "drawing_assignments_drawing_id_status_idx"
ON "drawing_assignments"("drawing_id", "status");

ALTER TABLE "drawing_assignments"
ADD CONSTRAINT "drawing_assignments_drawing_id_fkey"
FOREIGN KEY ("drawing_id") REFERENCES "drawings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drawing_assignments"
ADD CONSTRAINT "drawing_assignments_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "drawing_assignments"
ADD CONSTRAINT "drawing_assignments_assigned_by_admin_id_fkey"
FOREIGN KEY ("assigned_by_admin_id") REFERENCES "admin_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "drawing_assignments"
ADD CONSTRAINT "drawing_assignments_message_intent_id_fkey"
FOREIGN KEY ("message_intent_id") REFERENCES "message_intents"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
