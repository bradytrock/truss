import { normalizeShareToken } from "@/lib/share";
import {
  parseRealtorPortalPayload,
  type RealtorPortalPayload,
} from "@/lib/realtor-portal";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export function realtorPortalJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function realtorPortalNotFoundJson(token = "") {
  return realtorPortalJson({ error: "This realtor portal link isn’t available.", token }, 404);
}

export async function loadSharedRealtorPortal(
  token: string,
): Promise<RealtorPortalPayload | null> {
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6 || !isSupabaseConfigured()) return null;
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_realtor_portal", {
      p_token: trimmed,
    });
    if (error) {
      console.error("[realtor-portal] shared_realtor_portal", error.code, error.message);
      return null;
    }
    return parseRealtorPortalPayload(data);
  } catch (error) {
    console.error("[realtor-portal] shared_realtor_portal threw", error);
    return null;
  }
}
