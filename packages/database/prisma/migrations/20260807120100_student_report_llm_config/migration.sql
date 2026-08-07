INSERT INTO "llm_task_configs" ("id", "task", "primary_model_id", "enabled", "updated_at")
SELECT gen_random_uuid(), 'STUDENT_REPORT', "primary_model_id", true, CURRENT_TIMESTAMP
FROM "llm_task_configs"
WHERE "task" = 'STUDENT_PULSE'
ON CONFLICT ("task") DO NOTHING;

INSERT INTO "llm_task_configs" ("id", "task", "enabled", "updated_at")
VALUES (gen_random_uuid(), 'STUDENT_REPORT', true, CURRENT_TIMESTAMP)
ON CONFLICT ("task") DO NOTHING;
