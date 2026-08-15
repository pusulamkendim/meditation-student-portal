-- CreateEnum
CREATE TYPE "SubscriptionRenewalStatus" AS ENUM (
  'REMINDER_QUEUED',
  'CONTINUE_REQUESTED',
  'DECLINED',
  'PAYMENT_REPORTED',
  'COMPLETED'
);

-- CreateTable
CREATE TABLE "subscription_renewals" (
  "id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "source_subscription_period_id" UUID NOT NULL,
  "payment_id" UUID,
  "status" "SubscriptionRenewalStatus" NOT NULL DEFAULT 'REMINDER_QUEUED',
  "reminder_queued_at" TIMESTAMP(3) NOT NULL,
  "choice_recorded_at" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "subscription_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_renewals_source_subscription_period_id_key"
  ON "subscription_renewals"("source_subscription_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_renewals_payment_id_key"
  ON "subscription_renewals"("payment_id");

-- CreateIndex
CREATE INDEX "subscription_renewals_student_id_status_idx"
  ON "subscription_renewals"("student_id", "status");

-- AddForeignKey
ALTER TABLE "subscription_renewals"
  ADD CONSTRAINT "subscription_renewals_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_renewals"
  ADD CONSTRAINT "subscription_renewals_source_subscription_period_id_fkey"
  FOREIGN KEY ("source_subscription_period_id") REFERENCES "subscription_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_renewals"
  ADD CONSTRAINT "subscription_renewals_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
