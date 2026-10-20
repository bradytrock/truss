/**
 * Cloudflare's `npx wrangler deploy` builds this app with OpenNext. That
 * bundler compiles Node middleware (`src/proxy.ts`) with esbuild and enables
 * the custom export condition `module`.
 *
 * `@opentelemetry/api` (pulled in by Photon) publishes that condition as
 * `build/esm`, which Node never loads. The middleware file trace only copies
 * the CJS build (`build/src`) that `require()` actually resolves, so esbuild
 * stops with:
 *
 *   Could not resolve "@opentelemetry/api"
 *   The module "./build/esm/index.js" was not found
 *
 * Point the `module` and `esnext` conditions at `build/src`. Node's own
 * conditions stay `default` → `build/src`, so the Azure standalone server
 * resolves the same files it did before.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNodeModules = path.join(__dirname, "..", "node_modules");

function retarget(pkgDir, value) {
  if (typeof value !== "string") return value;
  if (!value.includes("build/esm") && !value.includes("build/esnext")) return value;
  const next = value.replaceAll("build/esnext", "build/src").replaceAll("build/esm", "build/src");
  return fs.existsSync(path.join(pkgDir, next)) ? next : value;
}

function patchExports(pkgDir, field) {
  if (!field || typeof field !== "object" || Array.isArray(field)) return false;
  let changed = false;
  for (const [key, value] of Object.entries(field)) {
    if (value && typeof value === "object") {
      if (patchExports(pkgDir, value)) changed = true;
      continue;
    }
    if (key !== "module" && key !== "esnext") continue;
    const next = retarget(pkgDir, value);
    if (next !== value) {
      field[key] = next;
      changed = true;
    }
  }
  return changed;
}

function patchPackage(packageJsonPath) {
  const pkgDir = path.dirname(packageJsonPath);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    console.warn(`[patch-opentelemetry-entry] could not read ${packageJsonPath}: ${error.message}`);
    return;
  }
  if (!patchExports(pkgDir, pkg.exports)) return;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[patch-opentelemetry-entry] pointed module/esnext exports at build/src in ${path.relative(rootNodeModules, packageJsonPath)}`);
}

function visitNodeModules(nodeModules) {
  const direct = path.join(nodeModules, "@opentelemetry", "api", "package.json");
  if (fs.existsSync(direct)) patchPackage(direct);

  let entries;
  try {
    entries = fs.readdirSync(nodeModules, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name === "@opentelemetry") continue;
    if (entry.name.startsWith("@")) {
      const scope = path.join(nodeModules, entry.name);
      let scoped;
      try {
        scoped = fs.readdirSync(scope, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const child of scoped) {
        if (!child.isDirectory()) continue;
        const nested = path.join(scope, child.name, "node_modules");
        if (fs.existsSync(nested)) visitNodeModules(nested);
      }
      continue;
    }
    const nested = path.join(nodeModules, entry.name, "node_modules");
    if (fs.existsSync(nested)) visitNodeModules(nested);
  }
}

if (fs.existsSync(rootNodeModules)) visitNodeModules(rootNodeModules);
