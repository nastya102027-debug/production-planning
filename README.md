# Планирование производства

Веб-система для планирования, запуска и контроля заказов производства металлоконструкций.

## Стек

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Database: PostgreSQL + Prisma
- Real-time: Socket.IO
- Auth: сессии в защищённых HTTP-only cookie, Argon2id для паролей
- Tests: Vitest

## Структура

- `apps/web` — интерфейс Планера и сотрудника участка
- `apps/api` — REST API, авторизация, RBAC и real-time события
- `packages/database` — схема данных и миграции
- `docs` — требования и архитектурные решения

## Локальный запуск

На исходном компьютере portable Node.js и локальная база находятся внутри исключённых из Git папок проекта. На другом компьютере их нужно подготовить отдельно: см. [PROJECT_SPEC.md](PROJECT_SPEC.md#работа-с-другого-компьютера).

1. Один раз запустите `powershell.exe -ExecutionPolicy Bypass -File scripts\setup-local.ps1`.
2. Для работы запустите `powershell.exe -ExecutionPolicy Bypass -File scripts\start-dev.ps1`.

На Windows можно просто дважды щёлкнуть файл `ОТКРЫТЬ ВЕБ-ПРИЛОЖЕНИЕ.cmd` в корне проекта.

Frontend: `http://localhost:5173`, API: `http://localhost:3000`.

Текущее состояние, ограничения и следующий этап описаны в [PROJECT_SPEC.md](PROJECT_SPEC.md). Начальные учётные записи создаёт seed-команда; пароли хранятся только в локальном `.env`, исключённом из Git.
