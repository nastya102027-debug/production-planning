import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export async function startLocalPostgres(projectRoot, env) {
  const databaseDir = join(projectRoot, ".local", "postgres");
  const databaseName = "production_planning_utf8";
  mkdirSync(join(projectRoot, ".local"), { recursive: true });
  const postgres = new EmbeddedPostgres({
    databaseDir,
    user: "production_app",
    password: env.DATABASE_PASSWORD,
    port: 5433,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
    onError: message => console.error("PostgreSQL:", message)
  });
  if (!existsSync(join(databaseDir, "PG_VERSION"))) await postgres.initialise();
  await postgres.start();
  const client = postgres.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (found.rowCount === 0) {
    await client.query(`CREATE DATABASE ${databaseName} WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'`);
  }
  await client.end();
  return postgres;
}
