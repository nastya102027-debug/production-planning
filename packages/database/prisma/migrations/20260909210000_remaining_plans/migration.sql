ALTER TABLE "OrderItem" ADD COLUMN "remainingPlan" JSONB, ADD COLUMN "remainingPlanVersion" INTEGER NOT NULL DEFAULT 0;
