import { normalizeShareToken } from "@/lib/share";
import { shareJson, shareNotFoundJson } from "@/lib/share-server";
import { withStorageShareAccessDeep } from "@/lib/storage/share-access";
import { createAnonClient } from "@/lib/supabase/anon";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("shared_page", { p_token: trimmed });
    if (error) {
      console.error("[share] shared_page", error.code, error.message);
      return shareNotFoundJson(trimmed);
    }
    if (data == null) {
      return shareNotFoundJson(trimmed);
    }
    return shareJson(withStorageShareAccessDeep(data, trimmed));
  } catch (error) {
    console.error("[share] shared_page threw", error);
    return shareNotFoundJson(trimmed);
  }
}
