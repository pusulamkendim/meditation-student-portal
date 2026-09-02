CREATE TABLE "public_analytics_events" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "pathname" TEXT NOT NULL,
    "slug" TEXT,
    "location" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "public_analytics_events_event_name_created_at_idx"
    ON "public_analytics_events"("event_name", "created_at");

CREATE INDEX "public_analytics_events_session_id_created_at_idx"
    ON "public_analytics_events"("session_id", "created_at");
