ALTER TABLE "OrderItem" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "OrderItem_orderId_archivedAt_idx" ON "OrderItem"("orderId", "archivedAt");
