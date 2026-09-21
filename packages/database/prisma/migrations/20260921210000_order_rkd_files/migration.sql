-- РКД, прикреплённая к конкретному заказу Планером.
CREATE TABLE "RkdFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RkdFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RkdFile_orderId_sha256_key" ON "RkdFile"("orderId", "sha256");
CREATE INDEX "RkdFile_orderId_createdAt_idx" ON "RkdFile"("orderId", "createdAt");
CREATE INDEX "RkdFile_uploaderId_idx" ON "RkdFile"("uploaderId");

ALTER TABLE "RkdFile" ADD CONSTRAINT "RkdFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RkdFile" ADD CONSTRAINT "RkdFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
