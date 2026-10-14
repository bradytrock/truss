import { NextResponse } from "next/server";
import { railwayDatabaseActive, railwayRestPort, TRUSS_DB_COOKIE } from "@/lib/railway-rest";
import { getSupabaseUrl } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

function isJwt(value: string) {
  return value.split(".").length === 3;
}

function stamp(response: NextResponse, railway: boolean) {
  if (!railway) return response;
  response.headers.set("x-truss-database", "railway");
  response.cookies.set(TRUSS_DB_COOKIE, "railway", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const suffix = `${path.filter(Boolean).join("/")}${url.search}`;
  const railway = railwayDatabaseActive();
  const target = railway
    ? `http://127.0.0.1:${railwayRestPort()}/${suffix}`
    : `${getSupabaseUrl()}/rest/v1/${suffix}`;
  const headers = new Headers(request.headers);
  for (const name of HOP) headers.delete(name);
  if (railway) {
    const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (bearer && !isJwt(bearer)) headers.delete("authorization");
  }
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const out = new Headers(response.headers);
    for (const name of HOP) out.delete(name);
    return stamp(new NextResponse(response.body, { status: response.status, headers: out }), railway);
  } catch {
    const message = railway
      ? "Railway database API is not running."
      : "Database API is not reachable.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
