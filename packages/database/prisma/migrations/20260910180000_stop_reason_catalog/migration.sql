CREATE TABLE "StopReasonCatalog" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StopReasonCatalog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StopReasonCatalog_name_key" ON "StopReasonCatalog"("name");
