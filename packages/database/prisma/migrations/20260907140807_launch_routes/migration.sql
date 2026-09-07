/*
  Warnings:

  - Added the required column `routeId` to the `ProductionLaunchItem` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProductionLaunchItem" ADD COLUMN     "routeId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "ProductionLaunchItem" ADD CONSTRAINT "ProductionLaunchItem_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
