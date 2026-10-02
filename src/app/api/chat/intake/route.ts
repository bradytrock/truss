import { NextResponse } from "next/server";
import { notifyWebsiteChatAdmins } from "@/lib/website-chat-notify";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chat is not available." }, { status: 503 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim().toLowerCase() : "";
  const person = typeof body.person === "string" ? body.person.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const phone = typeof body.phone === "string" ? body.phone : "";
  const street = typeof body.street === "string" ? body.street : "";
  const email = typeof body.email === "string" ? body.email : "";
  const city = typeof body.city === "string" ? body.city : "";
  const state = typeof body.state === "string" ? body.state : "";
  const postal = typeof body.postalCode === "string" ? body.postalCode : "";
  const market = typeof body.market === "string" ? body.market : "";
  const trades = typeof body.trades === "string" ? body.trades : "";
  const first = typeof body.firstName === "string" ? body.firstName : "";
  const last = typeof body.lastName === "string" ? body.lastName : "";
  if (!token) return NextResponse.json({ ok: false, error: "Missing chat." }, { status: 400 });

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("website_chat_intake", {
    p_token: token,
    p_name: name,
    p_phone: phone,
    p_street: street,
    p_email: email,
    p_city: city,
    p_state: state,
    p_postal: postal,
    p_market: market,
    p_trades: trades,
    p_first: first,
    p_last: last,
    p_slug: company,
    p_owner: person,
  });
  if (error) return NextResponse.json({ ok: false, error: "Chat is not ready yet." }, { status: 503 });

  const payload = (data ?? { ok: false }) as {
    ok?: boolean;
    error?: string;
    already?: boolean;
    admins?: Array<{ name?: string; email?: string }>;
    visitorName?: string;
    visitorPhone?: string;
    visitorStreet?: string;
    visitorEmail?: string;
    visitorCity?: string;
    visitorState?: string;
    visitorPostal?: string;
    market?: string;
    trades?: string;
    companyName?: string;
    companyEmail?: string;
    companyPhone?: string;
    ownerName?: string;
    jobId?: string;
    opportunityId?: string;
    channel?: string;
    token?: string;
  };
  if (payload.ok === false) return NextResponse.json({ ok: false, error: payload.error || "Could not start that." }, { status: 400 });

  if (!payload.already) {
    await notifyWebsiteChatAdmins({
      admins: payload.admins ?? [],
      name: payload.visitorName || name,
      phone: payload.visitorPhone || phone,
      street: payload.visitorStreet || street,
      companyName: payload.companyName || "",
      companyEmail: payload.companyEmail || "",
      ownerName: payload.ownerName || "",
      email: payload.visitorEmail || email,
      city: payload.visitorCity || city,
      state: payload.visitorState || state,
      postalCode: payload.visitorPostal || postal,
      market: payload.market || market,
      trades: payload.trades || trades,
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    already: Boolean(payload.already),
    jobId: payload.jobId ?? null,
    channel: payload.channel ?? "",
    visitorName: payload.visitorName || name,
    visitorPhone: payload.visitorPhone || phone,
    visitorStreet: payload.visitorStreet || street,
    phone: payload.companyPhone || "",
    companyName: payload.companyName || "",
    token: payload.token || token,
  });
}
