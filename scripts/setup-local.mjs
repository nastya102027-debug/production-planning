import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadOrCreateEnv } from "./local-env.mjs";
import { startLocalPostgres } from "./local-postgres.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const env = { ...process.env, ...loadOrCreateEnv(projectRoot) };
const nodeDir = join(projectRoot, ".tools", "node-v24.20.0-win-x64");
const npmCli = join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js");
const pathKey = Object.keys(env).find(key => key.toLowerCase() === "path") ?? "PATH";
env[pathKey] = `${nodeDir}${delimiter}${env[pathKey] ?? ""}`;
const postgres = await startLocalPostgres(projectRoot, env);
try {
  for (const args of [["run", "db:migrate"], ["run", "db:seed"]]) {
    const result = spawnSync(process.execPath, [npmCli, ...args], { cwd: projectRoot, env, stdio: "inherit" });
    if (result.status !== 0) throw result.error ?? new Error(`Команда npm завершилась с кодом ${result.status}`);
  }
} finally {
  await postgres.stop();
}
console.log("Локальная база готова. Учётные записи: Козыренко и employee.gibka. Пароли находятся в .env");
