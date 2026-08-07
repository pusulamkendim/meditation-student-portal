CREATE TYPE "StudentPulseTone" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');
CREATE TYPE "StudentPulseAction" AS ENUM ('KEEP', 'SIMPLIFY', 'DISCUSS');

CREATE TABLE "student_pulse_insights" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end_exclusive" DATE NOT NULL,
    "input_hash" TEXT NOT NULL,
    "tone" "StudentPulseTone" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "suggested_action" "StudentPulseAction" NOT NULL,
    "safety_concern" BOOLEAN NOT NULL DEFAULT false,
    "reflection_count" INTEGER NOT NULL,
    "analysis_encrypted" BYTEA NOT NULL,
    "analysis_key_id" TEXT NOT NULL,
    "model_ref" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pulse_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_pulse_insights_operation_id_key" ON "student_pulse_insights"("operation_id");
CREATE UNIQUE INDEX "student_pulse_insights_student_id_period_end_exclusive_key" ON "student_pulse_insights"("student_id", "period_end_exclusive");
CREATE INDEX "student_pulse_insights_student_id_created_at_idx" ON "student_pulse_insights"("student_id", "created_at");
CREATE INDEX "student_pulse_insights_tone_created_at_idx" ON "student_pulse_insights"("tone", "created_at");

ALTER TABLE "student_pulse_insights" ADD CONSTRAINT "student_pulse_insights_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "feature_flag_configs" ("key", "enabled", "rollout_percentage", "scope", "version", "updated_at")
VALUES ('llm.student-pulse.enabled', true, 100, 'GLOBAL', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "llm_task_configs" ("id", "task", "primary_model_id", "enabled", "updated_at")
SELECT gen_random_uuid(), 'STUDENT_PULSE', "primary_model_id", true, CURRENT_TIMESTAMP
FROM "llm_task_configs"
WHERE "task" = 'AGENT_REPLY'
ON CONFLICT ("task") DO NOTHING;

INSERT INTO "llm_task_configs" ("id", "task", "enabled", "updated_at")
VALUES (gen_random_uuid(), 'STUDENT_PULSE', true, CURRENT_TIMESTAMP)
ON CONFLICT ("task") DO NOTHING;
