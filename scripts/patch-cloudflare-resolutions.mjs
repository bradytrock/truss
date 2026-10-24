/**
 * `npx wrangler deploy` builds this Next.js app with OpenNext. Two esbuild
 * passes resolve packages differently from the Next.js file trace:
 *
 * - Node middleware (`src/proxy.ts`) is bundled with the custom condition
 *   `module`. `@opentelemetry/api` points that at `build/esm`, but the trace
 *   only copies the CommonJS `build/src` that Node's `require()` loads.
 * - The server bundle adds the `workerd` condition. Packages such as
 *   `uncrypto` point that at a browser build the trace never copies, because
 *   Node resolved the `node` / `import` entry instead.
 *
 * Point those bundler-only conditions at the file Node already traces.
 * Node does not enable `workerd`, `module`, or `esnext`, so the Azure
 * standalone server keeps its current resolution.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootNodeModules = path.join(__dirname, "..", "node_modules");

const IMPORT_CONDITIONS = new Set(["node", "import", "default"]);
const REQUIRE_CONDITIONS = new Set(["node", "require", "default"]);

function resolveCondition(entry, conditions) {
  if (typeof entry === "string") return entry;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  for (const [key, value] of Object.entries(entry)) {
    if (key === "types" || !conditions.has(key)) continue;
    if (typeof value === "string") return value;
    const nested = resolveCondition(value, conditions);
    if (nested) return nested;
  }
  return null;
}

function fileExists(pkgDir, spec) {
  if (typeof spec !== "string" || spec.startsWith("#")) return false;
  return fs.existsSync(path.join(pkgDir, spec));
}

function patchLevel(pkgDir, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return 0;
  let count = 0;
  const importTarget = resolveCondition(entry, IMPORT_CONDITIONS);
  const requireTarget = resolveCondition(entry, REQUIRE_CONDITIONS);
  for (const [key, value] of Object.entries(entry)) {
    if (value && typeof value === "object") {
      count += patchLevel(pkgDir, value);
      continue;
    }
    if (typeof value !== "string") continue;
    let next = null;
    if (key === "workerd" && importTarget && importTarget !== value) next = importTarget;
    if (
      (key === "module" || key === "esnext") &&
      (value.includes("build/esm") || value.includes("build/esnext")) &&
      requireTarget &&
      requireTarget !== value
    ) {
      next = requireTarget;
    }
    if (!next || !fileExists(pkgDir, next)) continue;
    entry[key] = next;
    count += 1;
  }
  return count;
}

function patchPackage(packageJsonPath) {
  const pkgDir = path.dirname(packageJsonPath);
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    console.warn(`[patch-cloudflare-resolutions] could not read ${packageJsonPath}: ${error.message}`);
    return;
  }
  if (!pkg.exports) return;
  const count = patchLevel(pkgDir, pkg.exports);
  if (!count) return;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const label = path.relative(rootNodeModules, packageJsonPath);
  console.log(`[patch-cloudflare-resolutions] retargeted ${count} export condition(s) in ${label}`);
}

function visitNodeModules(nodeModules) {
  let entries;
  try {
    entries = fs.readdirSync(nodeModules, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin") continue;
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
        const pkgDir = path.join(scope, child.name);
        const packageJson = path.join(pkgDir, "package.json");
        if (fs.existsSync(packageJson)) patchPackage(packageJson);
        const nested = path.join(pkgDir, "node_modules");
        if (fs.existsSync(nested)) visitNodeModules(nested);
      }
      continue;
    }
    const pkgDir = path.join(nodeModules, entry.name);
    const packageJson = path.join(pkgDir, "package.json");
    if (fs.existsSync(packageJson)) patchPackage(packageJson);
    const nested = path.join(pkgDir, "node_modules");
    if (fs.existsSync(nested)) visitNodeModules(nested);
  }
}

if (fs.existsSync(rootNodeModules)) visitNodeModules(rootNodeModules);
