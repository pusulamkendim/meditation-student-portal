ALTER TABLE "notification_deliveries"
ADD COLUMN "delivery_key" TEXT;

CREATE UNIQUE INDEX "notification_deliveries_delivery_key_key"
ON "notification_deliveries"("delivery_key");
