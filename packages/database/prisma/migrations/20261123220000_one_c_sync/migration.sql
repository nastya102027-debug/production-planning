ALTER TABLE "Order"
  ADD COLUMN "externalSource" TEXT,
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "externalVersion" TEXT,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

ALTER TABLE "OrderItem" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "Order_externalSource_externalId_key"
  ON "Order"("externalSource", "externalId");

CREATE UNIQUE INDEX "OrderItem_orderId_externalId_key"
  ON "OrderItem"("orderId", "externalId");
