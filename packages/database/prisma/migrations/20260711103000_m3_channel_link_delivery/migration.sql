ALTER TABLE "student_channel_identities" ADD COLUMN "last_inbound_at" TIMESTAMP(3);
CREATE TABLE "channel_link_tokens" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL,
 "channel" "ChannelType" NOT NULL, "token_hash" TEXT NOT NULL,
 "expires_at" TIMESTAMP(3) NOT NULL, "used_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "channel_link_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "channel_link_tokens_token_hash_key" ON "channel_link_tokens"("token_hash");
CREATE INDEX "channel_link_tokens_student_id_expires_at_idx" ON "channel_link_tokens"("student_id", "expires_at");
ALTER TABLE "channel_link_tokens" ADD CONSTRAINT "channel_link_tokens_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "message_delivery_events" (
 "id" UUID NOT NULL DEFAULT gen_random_uuid(), "channel" "ChannelType" NOT NULL,
 "external_message_id" TEXT NOT NULL, "status" "MessageStatus" NOT NULL,
 "provider_timestamp" TIMESTAMP(3) NOT NULL, "payload_hash" TEXT NOT NULL,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "message_delivery_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_delivery_events_dedupe_key" ON "message_delivery_events"("channel", "external_message_id", "status", "provider_timestamp", "payload_hash");
CREATE INDEX "message_delivery_events_external_message_id_provider_timestamp_idx" ON "message_delivery_events"("external_message_id", "provider_timestamp");
