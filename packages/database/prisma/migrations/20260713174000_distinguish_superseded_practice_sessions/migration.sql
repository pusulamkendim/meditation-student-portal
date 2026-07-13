UPDATE "practice_sessions"
SET
  "status" = 'SUPPRESSED',
  "cancelled_at" = NULL
WHERE
  "status" = 'CANCELLED'
  AND "cancellation_reason" = 'PLAN_SUPERSEDED';
