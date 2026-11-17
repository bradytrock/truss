import { NextResponse } from "next/server";
import { formatEstimateActivity, formatRecentUpdates, handleCassioMcp } from "@/lib/cassio-mcp";
import { createAnonClient } from "@/lib/supabase/anon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true, name: "truss-cassio" });
}

export async function POST(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token.length < 32) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const supabase = createAnonClient();
  const result = await handleCassioMcp(body, async (name, args) => {
    if (name === "estimate_activity") {
      const query = typeof args.query === "string" ? args.query : "";
      const { data, error } = await supabase.rpc("cassio_estimate_activity", { p_token: token, p_query: query });
      if (error) return "The book lookup is not available yet.";
      return formatEstimateActivity(data);
    }
    if (name === "recent_updates") {
      const { data, error } = await supabase.rpc("cassio_recent_updates", { p_token: token });
      if (error) return "The book lookup is not available yet.";
      return formatRecentUpdates(data);
    }
    return "That tool is not on this number.";
  });

  if (result.body === null) return new NextResponse(null, { status: result.status });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "mcp-protocol-version": "2025-03-26" },
  });
}
