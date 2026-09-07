import { spawn } from "node:child_process";
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
const child = spawn(process.execPath, [npmCli, "run", "dev"], { cwd: projectRoot, env, stdio: "inherit" });

let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (!child.killed) child.kill();
  await postgres.stop();
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
child.on("exit", code => stop(code ?? 0));
console.log("Веб-версия запускается: http://localhost:5173");
