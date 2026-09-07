import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOrCreateEnv } from "./local-env.mjs";
import { startLocalPostgres } from "./local-postgres.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, ...loadOrCreateEnv(projectRoot) };
const nodeDir = join(projectRoot, ".tools", "node-v24.20.0-win-x64");
const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = `${nodeDir}${delimiter}${env[pathKey] ?? ""}`;
const npmCli = join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
const postgres = await startLocalPostgres(projectRoot, env);
try {
  const name = process.argv[2] || "change";
  const result = spawnSync(process.execPath, [npmCli, "run", "db:migrate:dev", "--", "--name", name], { cwd: projectRoot, env, stdio: "inherit" });
  if (result.status !== 0) throw result.error ?? new Error(`Миграция завершилась с кодом ${result.status}`);
} finally {
  await postgres.stop();
}
