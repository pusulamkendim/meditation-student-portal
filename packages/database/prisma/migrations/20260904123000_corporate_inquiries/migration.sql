CREATE TYPE "CorporateInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED', 'SPAM');

CREATE TABLE "corporate_inquiries" (
    "id" UUID NOT NULL,
    "status" "CorporateInquiryStatus" NOT NULL DEFAULT 'NEW',
    "first_name_encrypted" BYTEA,
    "first_name_key_id" TEXT,
    "last_name_encrypted" BYTEA,
    "last_name_key_id" TEXT,
    "email_encrypted" BYTEA,
    "email_key_id" TEXT,
    "email_hmac" TEXT,
    "company_encrypted" BYTEA,
    "company_key_id" TEXT,
    "note_encrypted" BYTEA,
    "note_key_id" TEXT,
    "source_ip_hmac" TEXT,
    "session_id" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "privacy_notice_version" TEXT NOT NULL,
    "privacy_notice_accepted_at" TIMESTAMP(3) NOT NULL,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_delete_at" TIMESTAMP(3),
    "personal_data_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporate_inquiries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "corporate_inquiries_status_created_at_idx" ON "corporate_inquiries"("status", "created_at");
CREATE INDEX "corporate_inquiries_email_hmac_created_at_idx" ON "corporate_inquiries"("email_hmac", "created_at");
CREATE INDEX "corporate_inquiries_source_ip_hmac_created_at_idx" ON "corporate_inquiries"("source_ip_hmac", "created_at");
CREATE INDEX "corporate_inquiries_retention_delete_at_idx" ON "corporate_inquiries"("retention_delete_at");
