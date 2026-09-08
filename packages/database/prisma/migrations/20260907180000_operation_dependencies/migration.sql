-- CreateTable
CREATE TABLE "OperationDependency" (
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    CONSTRAINT "OperationDependency_pkey" PRIMARY KEY ("predecessorId", "successorId")
);

-- CreateIndex
CREATE INDEX "OperationDependency_successorId_idx" ON "OperationDependency"("successorId");

-- AddForeignKey
ALTER TABLE "OperationDependency" ADD CONSTRAINT "OperationDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationDependency" ADD CONSTRAINT "OperationDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Operation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
