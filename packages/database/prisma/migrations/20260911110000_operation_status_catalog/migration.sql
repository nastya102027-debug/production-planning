CREATE TABLE "OperationStatusCatalog" (
    "code" "OperationStatus" NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#687780',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationStatusCatalog_pkey" PRIMARY KEY ("code")
);

INSERT INTO "OperationStatusCatalog" ("code", "name", "color", "updatedAt") VALUES
    ('QUEUED', 'К запуску', '#7195b3', CURRENT_TIMESTAMP),
    ('IN_PROGRESS', 'В работе', '#3f8062', CURRENT_TIMESTAMP),
    ('PAUSED', 'Остановлено', '#bc7939', CURRENT_TIMESTAMP),
    ('COMPLETED', 'Готово', '#596a60', CURRENT_TIMESTAMP),
    ('CANCELLED', 'Отменено', '#9b5a5a', CURRENT_TIMESTAMP);
