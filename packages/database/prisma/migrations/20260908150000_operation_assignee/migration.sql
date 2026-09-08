ALTER TABLE "Operation" ADD COLUMN "assigneeId" TEXT;
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Operation_assigneeId_status_idx" ON "Operation"("assigneeId", "status");
