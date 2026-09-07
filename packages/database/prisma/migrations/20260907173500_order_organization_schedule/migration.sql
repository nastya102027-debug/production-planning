-- CreateEnum
CREATE TYPE "Organization" AS ENUM ('IP_VETROV', 'LATUNING', 'ECONTRID');

-- AlterTable
ALTER TABLE "Order"
ADD COLUMN "organization" "Organization",
ADD COLUMN "drawingApprovalDate" TIMESTAMP(3),
ADD COLUMN "productionLeadDays" INTEGER;
