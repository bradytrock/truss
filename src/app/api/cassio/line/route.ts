import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-origin";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { ASSISTANT_NAME } from "@/lib/product";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { isMissingCassioLine, missingCassioBookMessage, missingCassioLineMessage } from "@/lib/supabase/schema-errors";
import { configureHostedCassio, registerCassioBook } from "@/lib/zerosettle-server";
import { CASSIO_MANAGED_BY, cassioBookUrl, cassioLineQuery, looksLikeZerosettleToken, zerosettleTokenHint } from "@/lib/zerosettle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineChoice = { id: string; number: string; groupId: string };

type LineStatus = {
  ok?: boolean;
  linked?: boolean;
  lineId?: string;
  lineNumber?: string;
  groupId?: string;
  yourNumber?: string;
  active?: boolean;
  managedBy?: string;
  profileName?: string;
  tokenHint?: string;
  creditsLeft?: number | null;
  crmUpdates?: boolean;
  groupMessages?: boolean;
  bookReady?: boolean;
  linkedAt?: string | null;
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function statusFrom(value: unknown): LineStatus {
  const row = asRecord(value) ?? {};
  return {
    ok: row.ok === true,
    linked: row.linked === true,
    lineId: typeof row.lineId === "string" ? row.lineId : "",
    lineNumber: typeof row.lineNumber === "string" ? row.lineNumber : "",
    groupId: typeof row.groupId === "string" ? row.groupId : "",
    yourNumber: typeof row.yourNumber === "string" ? row.yourNumber : "",
    active: row.active === true,
    managedBy: typeof row.managedBy === "string" ? row.managedBy : "",
    profileName: typeof row.profileName === "string" ? row.profileName : "",
    tokenHint: typeof row.tokenHint === "string" ? row.tokenHint : "",
    creditsLeft: typeof row.creditsLeft === "number" ? row.creditsLeft : null,
    crmUpdates: row.crmUpdates === true,
    groupMessages: row.groupMessages === true,
    bookReady: row.bookReady === true,
    linkedAt: typeof row.linkedAt === "string" ? row.linkedAt : null,
    error: typeof row.error === "string" ? row.error : "",
  };
}

function publicStatus(status: LineStatus, extra?: { profileWarning?: string; sharesSender?: boolean; lines?: LineChoice[] }) {
  return {
    ok: status.ok !== false,
    linked: Boolean(status.linked),
    lineId: status.lineId ?? "",
    lineNumber: status.lineNumber ?? "",
    yourNumber: status.yourNumber ?? "",
    active: Boolean(status.active),
    managedBy: status.managedBy || (status.linked ? CASSIO_MANAGED_BY : ""),
    profileName: status.profileName ?? "",
    tokenHint: status.tokenHint ?? "",
    creditsLeft: status.creditsLeft ?? null,
    crmUpdates: Boolean(status.crmUpdates),
    groupMessages: Boolean(status.groupMessages),
    bookReady: Boolean(status.bookReady),
    linkedAt: status.linkedAt ?? null,
    profileWarning: extra?.profileWarning ?? "",
    sharesSender: Boolean(extra?.sharesSender),
    lines: extra?.lines ?? [],
    assistant: ASSISTANT_NAME,
  };
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, linked: false, error: "The database is not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ ok: false, linked: false, error: authError || "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase.rpc("cassio_line_status");
  if (error) {
    if (isMissingCassioLine(error)) {
      return NextResponse.json({ ok: false, linked: false, error: missingCassioLineMessage(), sql: missingCassioLineMessage() });
    }
    return NextResponse.json({ ok: false, linked: false, error: error.message }, { status: 400 });
  }
  const status = statusFrom(data);
  if (status.ok === false) return NextResponse.json({ ok: false, linked: false, error: status.error }, { status: 400 });
  return NextResponse.json(publicStatus(status));
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "The database is not configured." }, { status: 503 });
  }
  const supabase = await createClient();
  const { profile, error: authError } = await loadProfileCompany(supabase);
  if (!profile) return NextResponse.json({ ok: false, error: authError || "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { token?: string; lineId?: string; disconnect?: boolean; refresh?: boolean }
    | null;

  if (body?.disconnect) {
    const { data, error } = await supabase.rpc("cassio_line_disconnect");
    if (error) {
      if (isMissingCassioLine(error)) return NextResponse.json({ ok: false, error: missingCassioLineMessage() }, { status: 400 });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const status = statusFrom(data);
    if (status.ok === false) return NextResponse.json({ ok: false, error: status.error || "Could not disconnect." }, { status: 400 });
    return NextResponse.json(publicStatus({ ...status, linked: false }));
  }

  let token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token && body?.refresh) {
    const { data, error } = await supabase.rpc("cassio_line_secret");
    if (error) {
      if (isMissingCassioLine(error)) return NextResponse.json({ ok: false, error: missingCassioLineMessage() }, { status: 400 });
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    token = typeof data === "string" ? data.trim() : "";
    if (!token) return NextResponse.json({ ok: false, error: "Connect a ZeroSettle token first." }, { status: 400 });
  }
  if (!looksLikeZerosettleToken(token)) {
    return NextResponse.json({ ok: false, error: "Paste the API token from your ZeroSettle console." }, { status: 400 });
  }

  let lineId = typeof body?.lineId === "string" ? body.lineId.trim() : "";
  if (!lineId && body?.refresh) {
    const { data: current } = await supabase.rpc("cassio_line_status");
    const saved = statusFrom(current);
    lineId = saved.lineId || saved.lineNumber || "";
  }

  const [{ data: company }, memberResult] = await Promise.all([
    supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle(),
    profile.staff_id
      ? supabase.from("team_members").select("name, time_zone").eq("id", profile.staff_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const member = memberResult.error ? null : memberResult.data;

  const configured = await configureHostedCassio(token, {
    companyName: company?.name?.trim() || "",
    seatName: member?.name?.trim() || profile.full_name?.trim() || "",
    timeZone: member?.time_zone?.trim() || "",
    lineId,
  });
  if (!configured.ok) {
    return NextResponse.json(
      { ok: false, code: configured.code, error: configured.message, lines: configured.lines ?? [] },
      { status: configured.status === 409 ? 409 : configured.status >= 400 ? configured.status : 400 },
    );
  }

  const { data, error } = await supabase.rpc("cassio_line_save", {
    p_line_id: configured.line.choice.id,
    p_line_number: configured.line.choice.number,
    p_group_id: configured.line.choice.groupId,
    p_your_number: configured.line.yourNumber,
    p_active: configured.line.active,
    p_managed_by: CASSIO_MANAGED_BY,
    p_profile_name: configured.line.profileName,
    p_token_hint: zerosettleTokenHint(token),
    p_credits_left: configured.line.creditsLeft ?? -1,
    p_api_token: token,
  });
  if (error) {
    if (isMissingCassioLine(error)) return NextResponse.json({ ok: false, error: missingCassioLineMessage() }, { status: 400 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  let status = statusFrom(data);
  if (status.ok === false) return NextResponse.json({ ok: false, error: status.error || "Could not save the line." }, { status: 400 });

  const book = await connectCassioBook(supabase, token, configured.line.choice);
  if (book.status) status = book.status;
  const profileWarning = [configured.line.profileWarning, book.warning].filter(Boolean).join(" ");
  return NextResponse.json(
    publicStatus(status, {
      profileWarning,
      sharesSender: configured.line.sharesSender,
    }),
  );
}

async function connectCassioBook(
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiToken: string,
  choice: LineChoice,
) {
  const mcpToken = randomBytes(32).toString("hex");
  const origin = await appOrigin();
  const production =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`
      : "");
  const bookUrl = cassioBookUrl(origin, production);
  const saved = await supabase.rpc("cassio_line_set_book", { p_mcp_token: mcpToken, p_ready: false });
  if (saved.error) {
    const warning = isMissingCassioLine(saved.error) ? missingCassioBookMessage() : saved.error.message;
    return { warning, status: null as LineStatus | null };
  }
  const registered = await registerCassioBook(apiToken, {
    query: cassioLineQuery({ id: choice.id, number: choice.number, groupId: choice.groupId }),
    bookUrl,
    mcpToken,
  });
  if (!registered.ok) return { warning: registered.warning, status: statusFrom(saved.data) };
  const marked = await supabase.rpc("cassio_line_set_book", { p_mcp_token: "", p_ready: true });
  if (marked.error) return { warning: marked.error.message, status: statusFrom(saved.data) };
  return { warning: "", status: statusFrom(marked.data) };
}
