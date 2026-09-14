import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";

type UnsubscribeInfo = {
  email?: string;
  companyName?: string;
  unsubscribed?: boolean;
};

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Unsubscribe is not available." }, { status: 400 });
  }
  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (token.length < 8) {
    return NextResponse.json({ error: "That unsubscribe link is missing." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_unsubscribe_info", { p_token: token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const info = (data ?? null) as UnsubscribeInfo | null;
  if (!info) {
    return NextResponse.json({ error: "That unsubscribe link is not valid." }, { status: 404 });
  }
  return NextResponse.json({
    email: info.email || "",
    companyName: info.companyName || "",
    unsubscribed: Boolean(info.unsubscribed),
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Unsubscribe is not available." }, { status: 400 });
  }
  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = typeof body.token === "string" ? body.token.trim() : "";
  } catch {
    token = "";
  }
  if (token.length < 8) {
    return NextResponse.json({ error: "That unsubscribe link is missing." }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unsubscribe_email_campaign", { p_token: token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const info = (data ?? null) as UnsubscribeInfo | null;
  if (!info) {
    return NextResponse.json({ error: "That unsubscribe link is not valid." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, email: info.email || "", companyName: info.companyName || "" });
}
