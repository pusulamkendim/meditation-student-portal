CREATE INDEX "reading_public_visits_share_id_first_opened_at_idx"
    ON "reading_public_visits"("share_id", "first_opened_at");

CREATE INDEX "meditation_public_visits_share_id_first_opened_at_idx"
    ON "meditation_public_visits"("share_id", "first_opened_at");
