import { NextResponse } from "next/server";
import { isCardEventKind } from "@/lib/card-analytics";
import { requestAudit } from "@/lib/request-audit";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

/** Link-preview fetchers and scrapers should not show up as opens. */
const BOT = /bot|crawler|spider|crawling|preview|facebookexternalhit|slackbot|whatsapp|discord|telegram|embedly|quora|pinterest|vkshare|redditbot|applebot|bingbot|googlebot|headless|lighthouse|curl|wget|python-requests/i;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ ok: true });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const company = asString(input.company).toLowerCase();
  const person = asString(input.person).toLowerCase();
  const kind = asString(input.kind).toLowerCase();
  if (!company || !person || !isCardEventKind(kind)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const audit = requestAudit(request.headers);
  if (BOT.test(audit.userAgent)) return NextResponse.json({ ok: true, skipped: "bot" });

  try {
    const supabase = createAnonClient();
    const { error } = await supabase.rpc("record_card_event", {
      p_company: company,
      p_person: person,
      p_kind: kind,
      p_detail: asString(input.detail).slice(0, 60),
      p_ip: audit.ipAddress,
      p_user_agent: audit.userAgent,
    });
    if (error) {
      console.error("[cards] record_card_event", error.code, error.message);
      // A missing table must not surface to a homeowner looking at a card.
      return NextResponse.json({ ok: false });
    }
  } catch (error) {
    console.error("[cards] record_card_event threw", error);
    return NextResponse.json({ ok: false });
  }

  return NextResponse.json({ ok: true });
}
