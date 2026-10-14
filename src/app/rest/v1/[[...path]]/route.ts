import { NextResponse } from "next/server";
import { railwayRestPort, useRailwayDatabase } from "@/lib/railway-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "host", "content-length"]);

function isJwt(value: string) {
  return value.split(".").length === 3;
}

async function proxy(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (!useRailwayDatabase()) return new NextResponse(null, { status: 404 });
  const { path = [] } = await context.params;
  const url = new URL(request.url);
  const target = `http://127.0.0.1:${railwayRestPort()}/${path.filter(Boolean).join("/")}${url.search}`;
  const headers = new Headers(request.headers);
  for (const name of HOP) headers.delete(name);
  const bearer = headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer && !isJwt(bearer)) headers.delete("authorization");
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const out = new Headers(response.headers);
    for (const name of HOP) out.delete(name);
    return new NextResponse(response.body, { status: response.status, headers: out });
  } catch {
    return NextResponse.json({ error: "Railway database API is not running." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
