ALTER TABLE "student_report_shares"
  ADD COLUMN "token_encrypted" BYTEA,
  ADD COLUMN "token_key_id" TEXT,
  ADD COLUMN "message_intent_id" UUID,
  ADD COLUMN "last_sent_at" TIMESTAMP(3),
  ADD COLUMN "send_count" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "student_report_shares_message_intent_id_key"
  ON "student_report_shares"("message_intent_id");

ALTER TABLE "student_report_shares"
  ADD CONSTRAINT "student_report_shares_message_intent_id_fkey"
  FOREIGN KEY ("message_intent_id") REFERENCES "message_intents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
