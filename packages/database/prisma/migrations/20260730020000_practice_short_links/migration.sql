CREATE TABLE "practice_access_links" (
    "id" UUID NOT NULL,
    "practice_session_id" UUID NOT NULL,
    "code_hmac" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invalidated_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_access_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_access_links_practice_session_id_key"
ON "practice_access_links"("practice_session_id");

CREATE UNIQUE INDEX "practice_access_links_code_hmac_key"
ON "practice_access_links"("code_hmac");

CREATE INDEX "practice_access_links_expires_at_invalidated_at_idx"
ON "practice_access_links"("expires_at", "invalidated_at");

ALTER TABLE "practice_access_links"
ADD CONSTRAINT "practice_access_links_practice_session_id_fkey"
FOREIGN KEY ("practice_session_id") REFERENCES "practice_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
