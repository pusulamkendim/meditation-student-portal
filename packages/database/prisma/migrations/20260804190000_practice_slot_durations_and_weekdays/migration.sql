ALTER TABLE "practice_plans"
  ADD COLUMN "active_weekdays" INTEGER[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5, 6, 7];

ALTER TABLE "practice_plans"
  ADD CONSTRAINT "practice_plan_active_weekdays_valid"
  CHECK (
    cardinality("active_weekdays") BETWEEN 1 AND 7
    AND "active_weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7]
  );

-- Freeze existing active plans at the duration of each slot's next session.
-- Past and terminal sessions remain immutable.
WITH next_slot_session AS (
  SELECT DISTINCT ON (session."practice_slot_id")
    session."practice_slot_id",
    session."duration_minutes",
    session."meditation_render_id"
  FROM "practice_sessions" AS session
  JOIN "practice_plans" AS plan ON plan."id" = session."practice_plan_id"
  WHERE session."practice_slot_id" IS NOT NULL
    AND plan."status" IN ('ACTIVE', 'PAUSED', 'DRAFT')
    AND session."status" IN ('SCHEDULED', 'REMINDED')
    AND session."start_at" >= CURRENT_TIMESTAMP
  ORDER BY session."practice_slot_id", session."start_at" ASC
)
UPDATE "practice_slots" AS slot
SET "duration_minutes" = next_session."duration_minutes"
FROM next_slot_session AS next_session
WHERE slot."id" = next_session."practice_slot_id";

WITH next_slot_session AS (
  SELECT DISTINCT ON (session."practice_slot_id")
    session."practice_slot_id",
    session."duration_minutes",
    session."meditation_render_id"
  FROM "practice_sessions" AS session
  JOIN "practice_plans" AS plan ON plan."id" = session."practice_plan_id"
  WHERE session."practice_slot_id" IS NOT NULL
    AND plan."status" IN ('ACTIVE', 'PAUSED', 'DRAFT')
    AND session."status" IN ('SCHEDULED', 'REMINDED')
    AND session."start_at" >= CURRENT_TIMESTAMP
  ORDER BY session."practice_slot_id", session."start_at" ASC
)
UPDATE "practice_sessions" AS session
SET
  "duration_minutes" = next_session."duration_minutes",
  "meditation_render_id" = next_session."meditation_render_id",
  "version" = session."version" + 1,
  "updated_at" = CURRENT_TIMESTAMP
FROM next_slot_session AS next_session
WHERE session."practice_slot_id" = next_session."practice_slot_id"
  AND session."status" IN ('SCHEDULED', 'REMINDED')
  AND session."start_at" >= CURRENT_TIMESTAMP
  AND (
    session."duration_minutes" IS DISTINCT FROM next_session."duration_minutes"
    OR session."meditation_render_id" IS DISTINCT FROM next_session."meditation_render_id"
  );
