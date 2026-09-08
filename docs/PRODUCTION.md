# Production deployment

Status: free test deployment configuration prepared; Render authorization is required before provisioning. No hosted URL has been verified. Do not create or upgrade to paid resources without separate user approval.

The Docker image serves the compiled frontend and authenticated API on one origin. PostgreSQL runs separately. Only the login endpoint and health check are anonymous; business API endpoints require a session and enforce existing role permissions. Sessions use Secure, HttpOnly, SameSite=Strict cookies in production. Mutations require the configured browser Origin. Login attempts are rate limited per IP in memory; use a shared limiter before scaling to multiple instances.

## Render deployment

1. Connect `nastya102027-debug/production-planning`, branch `main`, to a Render Blueprint using `render.yaml`. Both the web service and PostgreSQL explicitly use `free`. Verify both plans in the dashboard. Stop if Render requests payment or a paid plan. The compiled `apps/web` frontend and `apps/api` backend share one web service and HTTPS origin.
2. Render generates the database credentials, session secret and initial account passwords. Retrieve account passwords only from the hosting dashboard. Never put values in Git, screenshots, logs or chat.
3. The container startup command applies Prisma migrations from `packages/database`, initializes work centers and accounts, then starts the server only if both commands succeed. Free Render web services do not support the paid pre-deploy step. Existing account passwords and inactive work centers are preserved on restart. The initial database is empty of production orders; importing existing local work requires a separate secured data-transfer step.
4. Render provides `RENDER_EXTERNAL_URL`, used as the allowed HTTPS origin. Set `WEB_ORIGIN` to the exact HTTPS origin when adding a custom domain. `TRUST_PROXY_HOPS=1` assumes one trusted hosting proxy; recheck this setting when changing providers.
5. PostgreSQL external connections are disabled with `ipAllowList: []`. The app uses the internal connection string. Configure and verify managed backups and restore procedures in the hosting account before relying on production data.
6. Verify the actual HTTPS URL: frontend loads; `.env` and `.git/config` return 404; business API returns 401 anonymously; authenticated planner and employee actions obey role permissions; secure cookies are set; changes persist after restarting the web service.

The Docker build copies only application and package directories, and `.dockerignore` excludes local secrets. Do not upload the working directory or local database. Run the container from `/app`; configure `DATABASE_URL`, `SESSION_SECRET`, `WEB_ORIGIN`, `NODE_ENV=production` and the platform `PORT`. Run migrations and initialization before starting the application.

Local validation cannot substitute for deploying the Linux image and testing the hosting environment. Docker was unavailable on the preparation machine.

## Free-plan limitations

Render's free PostgreSQL expires after 30 days and has no managed backups. A free web service sleeps after 15 minutes without inbound traffic. Its assigned URL does not depend on the local computer, but this setup is a time-limited test, not indefinite free production storage. Export test data before database expiry. See https://render.com/docs/free.
