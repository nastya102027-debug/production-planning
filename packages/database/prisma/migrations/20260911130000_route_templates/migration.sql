ALTER TABLE "Route" ADD COLUMN "sourceTemplateId" TEXT;

CREATE TABLE "RouteTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "archivedAt" TIMESTAMP(3),
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RouteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "canvasX" DOUBLE PRECISION,
    "canvasY" DOUBLE PRECISION,
    "material" TEXT,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "comment" TEXT,
    "components" JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT "RouteTemplateStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RouteTemplateStepDependency" (
    "predecessorId" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    CONSTRAINT "RouteTemplateStepDependency_pkey" PRIMARY KEY ("predecessorId", "successorId")
);

CREATE UNIQUE INDEX "RouteTemplateStep_templateId_position_key" ON "RouteTemplateStep"("templateId", "position");
CREATE INDEX "RouteTemplate_archivedAt_category_idx" ON "RouteTemplate"("archivedAt", "category");
CREATE INDEX "RouteTemplate_authorId_updatedAt_idx" ON "RouteTemplate"("authorId", "updatedAt");
CREATE INDEX "Route_sourceTemplateId_idx" ON "Route"("sourceTemplateId");

ALTER TABLE "Route" ADD CONSTRAINT "Route_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "RouteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RouteTemplate" ADD CONSTRAINT "RouteTemplate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteTemplateStep" ADD CONSTRAINT "RouteTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RouteTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteTemplateStep" ADD CONSTRAINT "RouteTemplateStep_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteTemplateStepDependency" ADD CONSTRAINT "RouteTemplateStepDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "RouteTemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteTemplateStepDependency" ADD CONSTRAINT "RouteTemplateStepDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "RouteTemplateStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;
