import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function prepareStandalone() {
  const standaloneDir = path.join(root, ".next", "standalone");
  const serverJs = path.join(standaloneDir, "server.js");
  if (!existsSync(serverJs)) {
    return false;
  }

  const staticSrc = path.join(root, ".next", "static");
  const staticDest = path.join(standaloneDir, ".next", "static");
  const publicSrc = path.join(root, "public");
  const publicDest = path.join(standaloneDir, "public");

  if (existsSync(staticSrc)) {
    mkdirSync(path.dirname(staticDest), { recursive: true });
    cpSync(staticSrc, staticDest, { recursive: true });
    console.log("[prepare-standalone] Copied .next/static");
  }

  if (existsSync(publicSrc)) {
    cpSync(publicSrc, publicDest, { recursive: true });
    console.log("[prepare-standalone] Copied public");
  }

  // Standalone bundles a package.json that still says `next start`, but the Next CLI
  // is not present in the standalone node_modules. Point start at server.js.
  const pkgPath = path.join(standaloneDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.scripts = { ...(pkg.scripts || {}), start: "node server.js" };
    delete pkg.scripts.postinstall;
    delete pkg.scripts.dev;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log("[prepare-standalone] Patched standalone package.json start → node server.js");
  }

  // PaaS scanners expect an explicit process.env.PORT listen. Next's standalone
  // server already does `parseInt(process.env.PORT, 10) || 3000` — verify and
  // normalize the fallback so deploys bind to the injected PORT.
  let serverSource = readFileSync(serverJs, "utf8");
  if (!serverSource.includes("process.env.PORT")) {
    throw new Error("[prepare-standalone] standalone server.js is missing process.env.PORT");
  }
  serverSource = serverSource.replace(
    /const currentPort = parseInt\(process\.env\.PORT, 10\) \|\| \d+/,
    "const currentPort = parseInt(process.env.PORT, 10) || 3000",
  );
  // Do not read process.env.HOSTNAME — Linux sets that to the container name.
  // Bind all interfaces unless HOST is an explicit listen address.
  serverSource = serverSource.replace(
    /const hostname = process\.env\.HOSTNAME \|\| ['"][^'"]+['"]/,
    "const hostname = process.env.HOST || '0.0.0.0'",
  );
  writeFileSync(serverJs, serverSource);
  console.log("[prepare-standalone] Confirmed server.js listens on process.env.PORT || 3000 at 0.0.0.0");

  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!prepareStandalone()) {
    console.log("[prepare-standalone] No .next/standalone/server.js — skipping");
  }
}
