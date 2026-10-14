import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const VERSION = "16.4";
const JWKS_URL =
  process.env.SUPABASE_JWKS_URL ||
  "https://cxrgdjvkmvnuztubxldh.supabase.co/auth/v1/.well-known/jwks.json";

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
  const { execFile } = await import("node:child_process");
  await new Promise((resolve, reject) => {
    execFile("tar", ["-xJf", archive, "-C", binDir], (error) => (error ? reject(error) : resolve()));
  });
  await chmod(bin, 0o755);
  return bin;
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
  if (process.env.NEXT_PUBLIC_USE_RAILWAY_DATABASE !== "1" || !databaseUrl) return null;
  if (!railwayHost(databaseUrl)) {
    throw new Error("DATABASE_URL is not a Railway Postgres host.");
  }

  await prepareDatabase(databaseUrl, root);
  const bin = await ensureBinary(root);
  const port = process.env.RAILWAY_REST_PORT?.trim() || "3210";
  const jwksResponse = await fetch(JWKS_URL);
  if (!jwksResponse.ok) throw new Error("Could not load the login signing keys.");
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
