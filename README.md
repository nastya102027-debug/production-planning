# Планирование производства

Веб-система для планирования, запуска и контроля заказов производства металлоконструкций.

## Стек

- Frontend: React + TypeScript + Vite
- Backend: NestJS + TypeScript
- Database: PostgreSQL + Prisma
- Real-time: Socket.IO
- Auth: сессии в защищённых HTTP-only cookie, Argon2id для паролей
- Tests: Vitest и Supertest

## Структура

- `apps/web` — интерфейс Планера и сотрудника участка
- `apps/api` — REST API, авторизация, RBAC и real-time события
- `packages/database` — схема данных и миграции
- `docs` — требования и архитектурные решения

## Локальный запуск

Системная установка не требуется: portable Node.js и локальный PostgreSQL находятся внутри папки проекта.

1. Один раз запустите `powershell.exe -ExecutionPolicy Bypass -File scripts\setup-local.ps1`.
2. Для работы запустите `powershell.exe -ExecutionPolicy Bypass -File scripts\start-dev.ps1`.

На Windows можно просто дважды щёлкнуть файл `ОТКРЫТЬ ВЕБ-ПРИЛОЖЕНИЕ.cmd` в корне проекта.

Frontend: `http://localhost:5173`, API: `http://localhost:3000`.

Проект находится на первом этапе разработки. Тестовые учётные записи будут созданы отдельной seed-командой без хранения открытых паролей в репозитории.
