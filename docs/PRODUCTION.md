# Production deployment

Status: configuration prepared; a hosting account and budget are required before provisioning. No production URL has been issued.

The Docker image serves the compiled frontend and authenticated API on one origin. PostgreSQL runs separately. Only the login endpoint and health check are anonymous; business API endpoints require a session and enforce existing role permissions. Sessions use Secure, HttpOnly, SameSite=Strict cookies in production. Mutations require the configured browser Origin. Login attempts are rate limited per IP in memory; use a shared limiter before scaling to multiple instances.

## Render deployment

1. Connect `nastya102027-debug/production-planning`, branch `main`, to a Render Blueprint using `render.yaml`. The configured service and database use paid plans; confirm costs in the dashboard before creating them.
2. Render generates the database credentials, session secret and initial account passwords. Retrieve account passwords only from the hosting dashboard. Never put values in Git, screenshots, logs or chat.
3. The pre-deploy command applies Prisma migrations and initializes work centers and accounts. Existing account passwords and inactive work centers are preserved. The initial database is empty of production orders; importing existing local work requires a separate secured data-transfer step.
4. Render provides `RENDER_EXTERNAL_URL`, used as the allowed HTTPS origin. Set `WEB_ORIGIN` to the exact HTTPS origin when adding a custom domain. `TRUST_PROXY_HOPS=1` assumes one trusted hosting proxy; recheck this setting when changing providers.
5. PostgreSQL external connections are disabled with `ipAllowList: []`. The app uses the internal connection string. Configure and verify managed backups and restore procedures in the hosting account before relying on production data.
6. Verify the actual HTTPS URL: frontend loads; `.env` and `.git/config` return 404; business API returns 401 anonymously; authenticated planner and employee actions obey role permissions; secure cookies are set; changes persist after restarting the web service.

The Docker build copies only application and package directories, and `.dockerignore` excludes local secrets. Do not upload the working directory or local database. Run the container from `/app`; configure `DATABASE_URL`, `SESSION_SECRET`, `WEB_ORIGIN`, `NODE_ENV=production` and the platform `PORT`. Run migrations and initialization before starting the application.

Local validation cannot substitute for deploying the Linux image and testing the hosting environment. Docker was unavailable on the preparation machine.
