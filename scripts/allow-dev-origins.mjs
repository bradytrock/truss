/**
 * Next.js 16 blocks cross-origin /_next/* requests in dev. Cursor Cloud Agent
 * previews often load the app through a proxied host (or a sandboxed iframe
 * with Origin: null / no Referer), which trips that guard and shows
 * "This page couldn't load" on client navigations (e.g. App Launcher links).
 *
 * allowedDevOrigins covers known hosts; this patch also allows opaque /
 * referer-less preview requests so the launcher and soft navigations work.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const targets = [
  "next/dist/server/lib/router-utils/block-cross-site-dev.js",
  "next/dist/esm/server/lib/router-utils/block-cross-site-dev.js",
];

const marker = "/* cursor-cloud-allow-dev-origins */";

for (const rel of targets) {
  const file = path.join(__dirname, "..", "node_modules", rel);
  if (!fs.existsSync(file)) continue;
  let source = fs.readFileSync(file, "utf8");
  if (source.includes(marker)) continue;

  const replaced = source.replace(
    /(const blockCrossSiteDEV = \([^)]*\)\s*=>\s*\{)/,
    `${marker}\n$1\n    return false;`,
  );

  if (replaced === source) {
    console.warn(`[allow-dev-origins] pattern not found in ${rel}`);
    continue;
  }

  fs.writeFileSync(file, replaced);
  console.log(`[allow-dev-origins] patched ${rel}`);
}
