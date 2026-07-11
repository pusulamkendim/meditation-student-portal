ALTER TABLE "standard_message_variants"
ADD COLUMN "requires_student_name" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "standard_message_variants_standard_message_id_channel_local_key";

CREATE UNIQUE INDEX "standard_message_variants_named_specificity_key"
ON "standard_message_variants"(
  "standard_message_id",
  "channel",
  "locale",
  "curriculum_stage",
  "slot",
  "requires_student_name",
  "priority"
);
