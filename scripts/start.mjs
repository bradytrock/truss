import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareStandalone } from "./prepare-standalone.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// PaaS (Hostinger, Railway, Render, etc.) inject PORT — always prefer it.
const port = Number(process.env.PORT) || 3000;
process.env.PORT = String(port);
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";

function run(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

const rootServer = path.join(root, "server.js");
const standaloneServer = path.join(root, ".next", "standalone", "server.js");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

console.log(`[start] Listening on port ${port} (process.env.PORT=${process.env.PORT})`);

// PaaS may extract the standalone bundle as the app root (/app/server.js).
if (existsSync(rootServer) && existsSync(path.join(root, ".next"))) {
  run(process.execPath, ["server.js"], root);
} else if (existsSync(standaloneServer)) {
  prepareStandalone();
  run(process.execPath, ["server.js"], path.join(root, ".next", "standalone"));
} else if (existsSync(nextBin)) {
  run(process.execPath, [nextBin, "start", "--hostname", "0.0.0.0", "--port", String(port)], root);
} else {
  console.error(
    "No Next.js server found. Run `npm run build` (expects .next/standalone/server.js) or install dependencies.",
  );
  process.exit(1);
}
