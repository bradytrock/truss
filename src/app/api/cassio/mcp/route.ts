import { NextResponse } from "next/server";
import { runCassioAction } from "@/lib/cassio-actions";
import { formatEstimateActivity, formatRecentUpdates, handleCassioMcp } from "@/lib/cassio-mcp";
import { cassioAudience, parseZerosettleMessages, type CassioAudience } from "@/lib/cassio-guard";
import { createAnonClient } from "@/lib/supabase/anon";
import { sendCassioSeedLine, zerosettleMessages } from "@/lib/zerosettle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

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
  const db = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  };
  const contextResult = await db.rpc("cassio_mcp_context", { p_token: token });
  const context = asRecord(contextResult.data);
  const apiToken = typeof context?.apiToken === "string" ? context.apiToken : "";
  const lineId = typeof context?.lineId === "string" ? context.lineId : "";
  const seedChatId = typeof context?.seedChatId === "string" ? context.seedChatId : "";
  const ownerPhones = Array.isArray(context?.ownerPhones)
    ? context.ownerPhones.filter((phone): phone is string => typeof phone === "string")
    : [];

  let audience: CassioAudience = "unknown";
  let latestText = "";
  if (context?.ok === true && apiToken) {
    try {
      const payload = await zerosettleMessages(apiToken, lineId);
      const messages = parseZerosettleMessages(payload);
      audience = cassioAudience({ messages, ownerPhones });
      latestText = messages
        .filter((message) => message.direction === "in")
        .sort((a, b) => b.ts - a.ts)[0]?.text ?? "";
    } catch {
      audience = "unknown";
    }
  }

  const result = await handleCassioMcp(body, async (name, args) => {
    return runCassioAction({
      name,
      args,
      token,
      audience,
      latestText,
      seedChatId,
      rpc: async (fn, fnArgs) => {
        const { data, error } = await db.rpc(fn, fnArgs);
        if (error) return { ok: false, error: "The book lookup is not available yet." };
        return data;
      },
      sendSeed: async (line) => sendCassioSeedLine({ apiToken, chatId: seedChatId, lineId, text: line }),
      readBook: async (tool, toolArgs) => {
        if (tool === "estimate_activity") {
          const query = typeof toolArgs.query === "string" ? toolArgs.query : "";
          const { data, error } = await db.rpc("cassio_estimate_activity", { p_token: token, p_query: query });
          if (error) return "The book lookup is not available yet.";
          return formatEstimateActivity(data);
        }
        const { data, error } = await db.rpc("cassio_recent_updates", { p_token: token });
        if (error) return "The book lookup is not available yet.";
        return formatRecentUpdates(data);
      },
    });
  });

  if (result.body === null) return new NextResponse(null, { status: result.status });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "mcp-protocol-version": "2025-03-26" },
  });
}
