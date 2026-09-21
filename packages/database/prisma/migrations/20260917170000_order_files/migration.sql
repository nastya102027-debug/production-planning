-- Файлы заказа из 1С (чертежи и прочее), привязка по номеру сделки
CREATE TABLE "OrderFile" (
    "id" TEXT NOT NULL,
    "dealNumber" TEXT NOT NULL,
    "stored" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '1C',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderFile_stored_key" ON "OrderFile"("stored");
CREATE UNIQUE INDEX "OrderFile_dealNumber_sha256_key" ON "OrderFile"("dealNumber", "sha256");
CREATE INDEX "OrderFile_dealNumber_createdAt_idx" ON "OrderFile"("dealNumber", "createdAt");
