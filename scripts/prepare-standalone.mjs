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

  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!prepareStandalone()) {
    console.log("[prepare-standalone] No .next/standalone/server.js — skipping");
  }
}
