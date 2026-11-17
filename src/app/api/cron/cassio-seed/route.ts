import { NextResponse } from "next/server";
import { publicSeedLine } from "@/lib/cassio-guard";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { sendCassioSeedLine } from "@/lib/zerosettle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim() ?? "";
  return header === `Bearer ${secret}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function serviceRpc(name: string, args: Record<string, unknown>) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!key) return null;
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const claimed = await serviceRpc("cassio_seed_outbox_claim", {});
  const rows = Array.isArray(claimed) ? claimed : [];
  let sent = 0;
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const id = typeof row.id === "string" ? row.id : "";
    const line = publicSeedLine(typeof row.body === "string" ? row.body : "");
    const ok = line
      ? await sendCassioSeedLine({
          apiToken: typeof row.apiToken === "string" ? row.apiToken : "",
          chatId: typeof row.chatId === "string" ? row.chatId : "",
          lineId: typeof row.lineId === "string" ? row.lineId : "",
          text: line,
        })
      : false;
    if (id) await serviceRpc("cassio_seed_outbox_mark", { p_id: id, p_sent: ok });
    if (ok) sent += 1;
  }
  return NextResponse.json({ ok: true, sent });
}
