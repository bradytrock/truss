import { NextResponse } from "next/server";
import { parseZerosettleMessages } from "@/lib/cassio-guard";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingCassioLine, missingCassioBookMessage } from "@/lib/supabase/schema-errors";
import { zerosettleGroupMessages, zerosettleGroups } from "@/lib/zerosettle-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "The database is not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ ok: false, error: authError || "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;

  if (action === "issue" || action === "clear") {
    const { data, error } = await supabase.rpc(action === "issue" ? "cassio_seed_issue" : "cassio_seed_clear");
    if (error) {
      const message = isMissingCassioLine(error) ? missingCassioBookMessage() : error.message;
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
    const status = asRecord(data);
    if (status?.ok === false) return NextResponse.json({ ok: false, error: status.error || "Could not update the Seeds chat." }, { status: 400 });
    return NextResponse.json({
      ok: true,
      seedVerified: status?.seedVerified === true,
      seedPhrase: typeof status?.seedPhrase === "string" ? status.seedPhrase : "",
    });
  }

  if (action !== "check") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const pending = await supabase.rpc("cassio_seed_pending");
  if (pending.error) {
    const message = isMissingCassioLine(pending.error) ? missingCassioBookMessage() : pending.error.message;
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  const row = asRecord(pending.data);
  if (!row || row.ok === false) {
    return NextResponse.json({ ok: false, error: row?.error || "Create a verification phrase first." }, { status: 400 });
  }
  const code = typeof row.code === "string" ? row.code : "";
  const apiToken = typeof row.apiToken === "string" ? row.apiToken : "";
  const lineId = typeof row.lineId === "string" ? row.lineId : "";
  const phrase = `Cassio seed check ${code}`;
  if (!code || !apiToken) {
    return NextResponse.json({ ok: false, error: "Create a verification phrase first." }, { status: 400 });
  }

  let groups: string[] = [];
  try {
    groups = await zerosettleGroups(apiToken, lineId);
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read groups on this number." }, { status: 502 });
  }

  const hits: string[] = [];
  for (const chatId of groups) {
    const payload = await zerosettleGroupMessages(apiToken, chatId);
    if (!payload) continue;
    const matched = parseZerosettleMessages(payload).some(
      (message) => message.direction === "in" && message.chatId === chatId && message.text.includes(phrase),
    );
    if (matched) hits.push(chatId);
  }

  if (hits.length !== 1) {
    return NextResponse.json(
      {
        ok: false,
        error:
          hits.length > 1
            ? "That phrase is in more than one group. Send a new phrase in the Seeds group only."
            : "Send the phrase in the Seeds group, then check again.",
      },
      { status: 400 },
    );
  }

  const saved = await supabase.rpc("cassio_seed_save", { p_chat_id: hits[0] });
  if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 400 });
  const status = asRecord(saved.data);
  if (status?.ok === false) return NextResponse.json({ ok: false, error: status.error || "Could not save the Seeds chat." }, { status: 400 });
  return NextResponse.json({ ok: true, seedVerified: true, seedPhrase: "" });
}
