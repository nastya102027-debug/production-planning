-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN     "responsibleId" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Procurement_responsibleId_status_idx" ON "Procurement"("responsibleId", "status");

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
