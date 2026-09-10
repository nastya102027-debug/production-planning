CREATE TABLE "IntegrationFieldMapping" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT '1C',
  "targetField" TEXT NOT NULL,
  "sourceField" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationFieldMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IntegrationFieldMapping_source_targetField_key" ON "IntegrationFieldMapping"("source", "targetField");
