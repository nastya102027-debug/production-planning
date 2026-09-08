-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerOrderNumber" TEXT;

-- CreateIndex
CREATE INDEX "Order_customerOrderNumber_idx" ON "Order"("customerOrderNumber");
