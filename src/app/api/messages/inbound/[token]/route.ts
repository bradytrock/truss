import { NextResponse } from "next/server";
import { ingestCompanyMessages } from "@/lib/inbound-ingest";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseKey, getSupabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = createClient<Database>(getSupabaseUrl(), getSupabaseKey());
  const { data, error } = await supabase.rpc("photon_inbound_company", { p_token: token });
  const row = asRecord(data);
  const companyId = row?.ok === true && typeof row.companyId === "string" ? row.companyId : "";
  if (error || !companyId) {
    const message =
      (typeof row?.error === "string" && row.error) ||
      error?.message ||
      "Unknown webhook.";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const result = await ingestCompanyMessages(raw, companyId);
  return NextResponse.json(result.body, { status: result.status });
}
