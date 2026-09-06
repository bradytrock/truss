import { normalizeShareToken } from "@/lib/share";
import { parsePortalPayload, type PortalPayload } from "@/lib/portal";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function portalJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function portalNotFoundJson(token = "") {
  return portalJson({ error: "This portal link isn’t available.", token }, 404);
}

export async function loadSharedPortal(token: string): Promise<PortalPayload | null> {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_portal", { p_token: trimmed });
    if (error) {
      console.error("[portal] shared_portal", error.code, error.message);
      return null;
    }
    return parsePortalPayload(data);
  } catch (error) {
    console.error("[portal] shared_portal threw", error);
    return null;
  }
}

export async function submitPortalReferral(input: {
  token: string;
  referredName: string;
  referredPhone?: string;
  referredEmail?: string;
  notes?: string;
  jobId?: string | null;
}): Promise<{ payload: PortalPayload | null; error?: string }> {
  const trimmed = normalizeShareToken(input.token);
  if (trimmed.length < 6) return { payload: null, error: "This portal link isn’t available." };
  if (!isSupabaseConfigured()) return { payload: null, error: "Portal isn’t connected yet." };
  const name = input.referredName.trim();
  if (name.length < 2) return { payload: null, error: "Add the neighbor’s name." };
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("submit_portal_referral", {
      p_token: trimmed,
      p_referred_name: name,
      p_referred_phone: input.referredPhone?.trim() ?? "",
      p_referred_email: input.referredEmail?.trim() ?? "",
      p_notes: input.notes?.trim() ?? "",
      p_job_id: input.jobId || null,
    });
    if (error) {
      console.error("[portal] submit_portal_referral", error.code, error.message);
      return { payload: null, error: error.message || "Could not send that referral." };
    }
    const payload = parsePortalPayload(data);
    if (!payload) return { payload: null, error: "Could not send that referral." };
    return { payload };
  } catch (error) {
    console.error("[portal] submit_portal_referral threw", error);
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Could not send that referral.",
    };
  }
}
