import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const VERSION = "16.4";

function railwayDatabaseEnabled() {
  const flag = (process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE ?? "").trim().toLowerCase();
  return flag === "railway";
}

function clerkFrontendApi(publishableKey) {
  const token = publishableKey?.trim() ?? "";
  const encoded = token.replace(/^pk_(test|live)_/, "");
  if (!encoded || encoded === token) return "";
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8").replace(/\$$/, "").trim();
    if (!decoded || /[^a-z0-9.-]/i.test(decoded)) return "";
    return decoded;
  } catch {
    return "";
  }
}

function clerkJwksUrl() {
  const explicit = process.env.CLERK_JWKS_URL?.trim() ?? "";
  if (explicit) return explicit;
  const host = clerkFrontendApi(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  if (!host) {
    throw new Error(
      "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY so Railway can check Clerk sign-in tokens. Supabase signing keys are not used.",
    );
  }
  return `https://${host}/.well-known/jwks.json`;
}

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function railwayHost(databaseUrl) {
  let host = "";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    host = "";
  }
  return host.endsWith("rlwy.net") || host.endsWith("railway.internal");
}

function withSsl(databaseUrl) {
  if (/[?&]sslmode=/.test(databaseUrl)) return databaseUrl;
  return `${databaseUrl}${databaseUrl.includes("?") ? "&" : "?"}sslmode=require`;
}

async function prepareDatabase(databaseUrl, root) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const sql = readFileSync(path.join(root, "scripts", "railway-prepare.sql"), "utf8");
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function assetName() {
  const arch = process.arch === "arm64" ? "aarch64" : "x86-64";
  return `postgrest-v${VERSION}-linux-static-${arch}.tar.xz`;
}

async function ensureBinary(root) {
  const binDir = path.join(root, "bin");
  const bin = path.join(binDir, "postgrest");
  if (existsSync(bin)) return bin;
  mkdirSync(binDir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/v${VERSION}/${assetName()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download the Railway API binary (${response.status}).`);
  const archive = path.join(binDir, assetName());
  await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  await extractArchive(archive, binDir);
  await chmod(bin, 0o755);
  return bin;
}

async function extractArchive(archive, binDir) {
  const { execFile } = await import("node:child_process");
  const xz = await import("xz-decompress");
  const XzReadableStream = xz.XzReadableStream ?? xz.default?.XzReadableStream;
  const tarPath = archive.replace(/\.xz$/, "");
  await pipeline(
    Readable.fromWeb(new XzReadableStream(Readable.toWeb(createReadStream(archive)))),
    createWriteStream(tarPath),
  );
  await new Promise((resolve, reject) => {
    execFile("tar", ["-xf", tarPath, "-C", binDir], (error) => (error ? reject(error) : resolve()));
  });
  await rm(archive, { force: true });
  await rm(tarPath, { force: true });
}

function waitForPort(port) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = createConnection({ host: "127.0.0.1", port: Number(port) });
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > 15000) {
          reject(new Error("Railway database API did not start."));
          return;
        }
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

export async function startRailwayRest(root) {
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env"));
  const databaseUrl = process.env.DATABASE_URL?.trim() || "";
  if (!railwayDatabaseEnabled()) return null;
  if (!databaseUrl) {
    console.error("[railway] DATABASE_URL is not set. Database calls are not sent to Supabase.");
    return null;
  }
  if (!railwayHost(databaseUrl)) {
    throw new Error("DATABASE_URL is not a Railway Postgres host.");
  }

  await prepareDatabase(databaseUrl, root);
  const bin = await ensureBinary(root);
  const port = process.env.RAILWAY_REST_PORT?.trim() || "3210";
  const jwksResponse = await fetch(clerkJwksUrl());
  if (!jwksResponse.ok) throw new Error("Could not load the Clerk signing keys.");
  const jwks = await jwksResponse.text();
  const dir = await mkdtemp(path.join(tmpdir(), "truss-railway-"));
  const jwksPath = path.join(dir, "jwks.json");
  const configPath = path.join(dir, "postgrest.conf");
  await writeFile(jwksPath, jwks, { mode: 0o600 });
  const adminPort = String(Number(port) + 1);
  const config = [
    `db-uri = "${withSsl(databaseUrl)}"`,
    `db-schemas = "public"`,
    `db-anon-role = "anon"`,
    `db-pre-request = "public.reject_superuser_api"`,
    `db-use-legacy-gucs = true`,
    `server-host = "127.0.0.1"`,
    `server-port = ${port}`,
    `admin-server-host = "127.0.0.1"`,
    `admin-server-port = ${adminPort}`,
    `jwt-secret = "@${jwksPath}"`,
    "",
  ].join("\n");
  await writeFile(configPath, config, { mode: 0o600 });

  const child = spawn(bin, [configPath], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code, signal) => {
    if (signal) return;
    console.error(`[railway] database API exited ${code ?? 0}`);
  });
  await waitForPort(port);
  console.log(`[railway] Database API on 127.0.0.1:${port}`);
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  startRailwayRest(root).catch((error) => {
    console.error(error instanceof Error ? error.message : "Railway database API failed to start.");
    process.exit(1);
  });
}
