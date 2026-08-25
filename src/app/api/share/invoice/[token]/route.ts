import { NextResponse } from "next/server";
import { normalizeShareToken } from "@/lib/share";
import { shareNotFoundJson } from "@/lib/share-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const trimmed = normalizeShareToken(token);
  if (trimmed.length < 6) {
    return shareNotFoundJson(trimmed);
  }
  if (!isSupabaseConfigured()) {
    return shareNotFoundJson(trimmed);
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shared_invoice", { p_token: trimmed });
    if (error || data == null) {
      return shareNotFoundJson(trimmed);
    }
    return NextResponse.json(data);
  } catch {
    return shareNotFoundJson(trimmed);
  }
}
