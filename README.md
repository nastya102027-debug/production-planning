# Планирование производства

Веб-система для планирования, запуска и контроля заказов производства металлоконструкций.

## Стек

- Frontend: React + TypeScript + Vite
- Backend: Express + TypeScript
- Database: PostgreSQL + Prisma
- Real-time: SSE (обновление задач и уведомлений)
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

## Проверка

`npm test` — модульные тесты. `npm run build` — сборка API и интерфейса.

`node scripts/verify-production.mjs` — сквозная проверка API в отдельной временной базе PostgreSQL. Нужны работающий локальный PostgreSQL и предварительно собранный API; тестовая база удаляется в конце, рабочие заказы не меняются.

Для проверки браузера на Windows установите инструмент: `npm install --prefix .tools/qa --no-package-lock playwright`. При запущенном интерфейсе на порту 5173 и установленном Google Chrome выполните `node scripts/verify-production.mjs --browser`. Порт 3101 должен быть свободен. Снимки экранов сохраняются в исключённую из Git папку `.local`.
