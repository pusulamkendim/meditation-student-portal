ALTER TABLE "messages"
  ADD COLUMN "message_intent_id" UUID,
  ADD COLUMN "reply_to_message_id" UUID;

CREATE UNIQUE INDEX "messages_message_intent_id_key" ON "messages"("message_intent_id");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_message_intent_id_fkey"
  FOREIGN KEY ("message_intent_id") REFERENCES "message_intents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "conversation_context_resolutions" (
  "id" UUID NOT NULL,
  "inbox_event_id" UUID NOT NULL,
  "source_message_id" UUID,
  "event_key" TEXT,
  "entity_type" TEXT,
  "entity_id" UUID,
  "resolution_method" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_context_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_context_resolutions_inbox_event_id_key"
  ON "conversation_context_resolutions"("inbox_event_id");
CREATE INDEX "conversation_context_resolutions_event_key_resolved_at_idx"
  ON "conversation_context_resolutions"("event_key", "resolved_at");

ALTER TABLE "conversation_context_resolutions"
  ADD CONSTRAINT "conversation_context_resolutions_inbox_event_id_fkey"
  FOREIGN KEY ("inbox_event_id") REFERENCES "inbox_events"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
