INSERT INTO "consents" (
  "id",
  "student_id",
  "scope",
  "status",
  "text_version",
  "channel",
  "external_message_id",
  "occurred_at",
  "created_at"
)
SELECT
  gen_random_uuid(),
  receipt."student_id",
  'REFLECTION_STORAGE'::"ConsentScope",
  'GRANTED'::"ConsentStatus",
  'kvkk-v1-policy-alignment',
  receipt."channel",
  receipt."external_message_id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "privacy_notice_receipts" receipt
WHERE NOT EXISTS (
  SELECT 1
  FROM "consents" consent
  WHERE consent."student_id" = receipt."student_id"
    AND consent."scope" = 'REFLECTION_STORAGE'::"ConsentScope"
    AND consent."text_version" = 'kvkk-v1-policy-alignment'
);
