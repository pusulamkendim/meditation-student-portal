CREATE TABLE "webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channel" "ChannelType" NOT NULL,
  "account_external_id" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "external_message_id" TEXT,
  "payload_hash" TEXT NOT NULL,
  "result" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_dedupe_key_key" ON "webhook_events"("dedupe_key");
CREATE INDEX "webhook_events_channel_account_external_id_created_at_idx"
ON "webhook_events"("channel", "account_external_id", "created_at");
