import { NextResponse } from "next/server";
import { loadProfileCompany } from "@/lib/eagleview-server";
import { looksLikePhone } from "@/lib/phone";
import { loadPhotonConnection, photonAccountFromRow } from "@/lib/photon-account";
import { photonStatus, photonText, photonWorkerConfigured } from "@/lib/photon";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function companyAccount() {
  const supabase = await createClient();
  const { profile, error } = await loadProfileCompany(supabase);
  if (!profile?.company_id) return { error: error || "Sign in to send a text.", account: null, companyId: "" };
  const { row } = await loadPhotonConnection(supabase, profile.company_id);
  return { error: "", account: photonAccountFromRow(row), companyId: profile.company_id };
}

export async function GET() {
  const loaded = await companyAccount();
  if (!loaded.companyId) {
    return NextResponse.json({ error: loaded.error }, { status: 401 });
  }
  return NextResponse.json(await photonStatus(loaded.account));
}

export async function POST(request: Request) {
  const loaded = await companyAccount();
  if (!loaded.companyId) {
    return NextResponse.json({ error: loaded.error || "Sign in to send a text." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Could not read that request." }, { status: 400 });
  }

  const to = typeof body.to === "string" ? body.to : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!looksLikePhone(to)) {
    return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "Write a message before sending." }, { status: 400 });
  }

  if (!loaded.account) {
    return NextResponse.json({
      ok: true,
      mocked: true,
      configured: false,
      to,
      handle: "",
    });
  }

  try {
    const result = await photonText({
      to,
      content,
      companyId: loaded.companyId,
      account: loaded.account,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mocked: result.mocked,
      configured: photonWorkerConfigured() || !result.mocked,
      to: result.to,
      handle: result.handle,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reach Photon." },
      { status: 502 },
    );
  }
}
