import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Prefer process.env.PORT (PaaS / preview injects it). Fall back to 3847 locally.
const port = String(process.env.PORT || "3847");
process.env.PORT = port;

const allowOrigins = path.join(root, "scripts", "allow-dev-origins.mjs");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code) reject(new Error(`${args.join(" ")} exited ${code}`));
      else resolve();
    });
  });
}

await run(process.execPath, [allowOrigins]);

console.log(`[dev] Listening on port ${port} (process.env.PORT)`);

spawn(process.execPath, [nextBin, "dev", "--hostname", "0.0.0.0", "--port", port], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
}).on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
