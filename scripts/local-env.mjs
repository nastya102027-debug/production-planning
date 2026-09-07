import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export function loadOrCreateEnv(projectRoot) {
  const path = join(projectRoot, ".env");
  if (!existsSync(path)) {
    const values = {
      DATABASE_PASSWORD: randomBytes(24).toString("hex"),
      SESSION_SECRET: randomBytes(48).toString("base64"),
      PLANNER_INITIAL_PASSWORD: `Planer-${randomBytes(8).toString("hex")}!`,
      EMPLOYEE_INITIAL_PASSWORD: `Uchastok-${randomBytes(8).toString("hex")}!`
    };
    writeFileSync(path, [
      `DATABASE_URL="postgresql://production_app:${values.DATABASE_PASSWORD}@127.0.0.1:5433/production_planning_utf8?schema=public"`,
      `DATABASE_PASSWORD="${values.DATABASE_PASSWORD}"`,
      `SESSION_SECRET="${values.SESSION_SECRET}"`,
      `API_PORT="3000"`,
      `WEB_ORIGIN="http://localhost:5173"`,
      `PLANNER_INITIAL_PASSWORD="${values.PLANNER_INITIAL_PASSWORD}"`,
      `EMPLOYEE_INITIAL_PASSWORD="${values.EMPLOYEE_INITIAL_PASSWORD}"`, ""
    ].join("\n"), { encoding: "utf8", mode: 0o600 });
  }
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)="(.*)"$/);
    if (match) env[match[1]] = match[2];
  }
  if (env.DATABASE_URL) {
    const databaseUrl = new URL(env.DATABASE_URL);
    databaseUrl.pathname = "/production_planning_utf8";
    env.DATABASE_URL = databaseUrl.toString();
  }
  return env;
}
