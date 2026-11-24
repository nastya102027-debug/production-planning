ALTER TABLE "OrderFile"
  ADD COLUMN "externalId" TEXT,
  ADD COLUMN "externalVersion" TEXT,
  ADD COLUMN "data" BYTEA;

CREATE UNIQUE INDEX "OrderFile_externalId_key" ON "OrderFile"("externalId");

